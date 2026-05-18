Set-StrictMode -Off
$ErrorActionPreference = 'Continue'
$env:PGPASSWORD = 'password'

function psql_run($sql) {
    $result = & psql -U postgres -d pos_system -c $sql 2>&1
    $result | ForEach-Object { Write-Host $_ }
}

Write-Host "=== CHECK 2: Supplier OB Verification ===" -ForegroundColor Cyan

# Auth
$login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@samplepos.com","password":"admin123"}'
$HDR = @{ Authorization = "Bearer $($login.data.accessToken)" }
Write-Host "Auth OK - email: $($login.data.user.email), role: $($login.data.user.role)"

$SUP_ID = "ef5c52d5-e64f-4801-af42-49d7629db854"

# Check for existing OB on this supplier first
Write-Host "`n--- Pre-check: Existing OB records ---"
psql_run 'SELECT "SupplierInvoiceNumber", document_type, "Status", "OutstandingBalance" FROM supplier_invoices WHERE "SupplierId" = ''ef5c52d5-e64f-4801-af42-49d7629db854'' AND document_type = ''OPENING_BALANCE'';'

# Post opening balance
Write-Host "`n--- Posting Opening Balance ---"
$obBodyObj = @{
    supplierId = $SUP_ID
    amount     = 500000
    asOfDate   = "2026-01-01"
    notes      = "VERIFY-TEST opening balance"
}
$obBody = $obBodyObj | ConvertTo-Json
try {
    $obResult = Invoke-RestMethod -Uri "http://localhost:3001/api/supplier-payments/invoices/opening-balance" -Method POST -Headers $HDR -ContentType "application/json" -Body $obBody
    $OB_INV_ID = $obResult.data.invoiceId
    Write-Host "SUCCESS: invoiceId=$OB_INV_ID"
    Write-Host "Full response:"
    $obResult | ConvertTo-Json -Depth 5
} catch {
    Write-Host "ERROR posting OB: $($_.Exception.Message)" -ForegroundColor Red
    $stream = $_.Exception.Response.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    Write-Host "Response: $($reader.ReadToEnd())"
    exit 1
}

# CHECK 2a: Invoice list must NOT show OB entry as SUPPLIER_INVOICE
Write-Host "`n--- CHECK 2a: Invoice list (must not contain OB entry) ---"
$invList = Invoke-RestMethod -Uri "http://localhost:3001/api/supplier-payments/invoices?supplierId=$SUP_ID" -Method GET -Headers $HDR
$obInList = $invList.data.data | Where-Object { $_.documentType -eq "OPENING_BALANCE" -or $_.invoiceType -eq "OPENING_BALANCE" -or $_.document_type -eq "OPENING_BALANCE" }
if ($obInList) {
    Write-Host "FAIL: OB entry appears in invoice list!" -ForegroundColor Red
    $obInList | ConvertTo-Json -Depth 3
} else {
    $totalCount = if ($invList.data.data) { ($invList.data.data).Count } else { 0 }
    Write-Host "PASS: OB entry NOT visible in invoice list (total invoices shown: $totalCount)" -ForegroundColor Green
}

# CHECK 2b: GL journal must be DR 3050 / CR 2100 with source=CUTOVER_OB
Write-Host "`n--- CHECK 2b: GL journal (DR 3050 / CR 2100 / source=CUTOVER_OB) ---"
psql_run 'SELECT lt."PostingSource", lt."ReferenceType", le."EntryType", a."AccountCode", le."DebitAmount", le."CreditAmount" FROM ledger_transactions lt JOIN ledger_entries le ON le."TransactionId"=lt."Id" JOIN accounts a ON a."Id"=le."AccountId" WHERE lt."PostingSource"=''CUTOVER_OB'' ORDER BY le."EntryType";'

# CHECK 2c: Account 3050 AllowedSources includes CUTOVER_OB
Write-Host "`n--- CHECK 2c: Account 3050 AllowedSources ---"
psql_run 'SELECT "AccountCode", "AllowedSources" FROM accounts WHERE "AccountCode"=''3050'';'

# CHECK 2c2: supplier_invoices constraint
Write-Host "`n--- CHECK 2c2: supplier_invoices constraint includes OPENING_BALANCE ---"
psql_run "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'chk_supplier_invoices_document_type';"

# CHECK 2d: Idempotency - second post must fail gracefully
Write-Host "`n--- CHECK 2d: Idempotency (second OB must be rejected) ---"
try {
    $ob2 = Invoke-RestMethod -Uri "http://localhost:3001/api/supplier-payments/invoices/opening-balance" -Method POST -Headers $HDR -ContentType "application/json" -Body $obBody
    Write-Host "FAIL: Second OB was accepted! id=$($ob2.data.invoiceId)" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "PASS: Second OB rejected with HTTP $code" -ForegroundColor Green
}

Write-Host "`n=== CHECK 2 COMPLETE ===" -ForegroundColor Cyan
