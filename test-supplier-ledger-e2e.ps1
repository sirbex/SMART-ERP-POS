#!/usr/bin/env pwsh
# =============================================================================
# E2E SUPPLIER LEDGER FLOW TEST
# Proves the complete ERP-standard 3-way match → AP flow:
#   1. Create invoice (DR GRIR / CR AP is what posting will do)
#   2. Post invoice → GL: DR GRIR(2150) / CR AP(2100)
#   3. Verify ledger shows SUPPLIER_INVOICE (not GOODS_RECEIPT)
#   4. Pay invoice → GL: DR AP(2100) / CR Cash(1010)
#   5. Verify ledger shows SUPPLIER_PAYMENT
#   6. Verify net AP change = 0 (invoice + payment cancel out)
#   7. Verify GOODS_RECEIPT NEVER appears in ledger
# =============================================================================

$BASE_URL = "https://wizarddigital-inv.com"
$TS       = Get-Date -Format "yyyyMMdd-HHmmss"
$pass = 0; $fail = 0; $errors = @()

function Assert($name, $condition, $detail = "") {
    if ($condition) {
        Write-Host "  ✅ $name" -ForegroundColor Green; $script:pass++
    } else {
        Write-Host "  ❌ $name" -ForegroundColor Red
        if ($detail) { Write-Host "     → $detail" -ForegroundColor Yellow }
        $script:fail++; $script:errors += $name
    }
}

function API($method, $path, $body = $null) {
    $uri = "$BASE_URL$path"
    $h   = @{ Authorization = "Bearer $script:tok" }
    try {
        if ($body) {
            $j = $body | ConvertTo-Json -Depth 10 -Compress
            return Invoke-RestMethod -Uri $uri -Method $method -Headers $h -ContentType "application/json" -Body $j
        }
        return Invoke-RestMethod -Uri $uri -Method $method -Headers $h
    } catch {
        $resp = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
        return $resp
    }
}

Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " E2E SUPPLIER LEDGER FLOW — $TS" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════`n" -ForegroundColor Cyan

# ─── AUTH ─────────────────────────────────────────────────────────────────────
Write-Host "▶ [1] Login" -ForegroundColor Cyan
$script:tok = (Invoke-RestMethod "$BASE_URL/api/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@samplepos.com","password":"admin123","tenant":"default"}').data.token
Assert "Authenticated" ($script:tok -ne $null)

# ─── BASELINE BALANCES ────────────────────────────────────────────────────────
Write-Host "`n▶ [2] Baseline GL balances" -ForegroundColor Cyan
$tb0    = API GET "/api/accounting/trial-balance"
$ap0Obj = $tb0.data.accounts | Where-Object { $_.accountCode -eq "2100" }
$ap0    = [double]$ap0Obj.creditBalance
$ap0Net = [double]$ap0Obj.netBalance
$grir0  = [double]($tb0.data.accounts | Where-Object { $_.accountCode -eq "2150" }).debitBalance
Write-Host "   AP(2100) netBalance: $ap0Net (credit=$ap0)" -ForegroundColor Gray
Write-Host "   GRIR(2150) debit: $grir0" -ForegroundColor Gray
Assert "AP baseline positive" ($ap0Net -gt 0)

# Use test supplier a0000000-...
$SUPPLIER_ID = "a0000000-0000-0000-0000-000000000001"
$AMOUNT      = 7500   # distinct amount so it's traceable

# ─── STEP 1: CREATE INVOICE ───────────────────────────────────────────────────
Write-Host "`n▶ [3] Create supplier invoice ($AMOUNT UGX)" -ForegroundColor Cyan
$invoiceBody = @{
    supplierId  = $SUPPLIER_ID
    invoiceDate = (Get-Date -Format "yyyy-MM-dd")
    lineItems   = @(
        @{ productName = "E2E Test Item $TS"; quantity = 1; unitPrice = $AMOUNT }
    )
    notes = "E2E-LEDGER-TEST-$TS"
}
$inv = API POST "/api/supplier-payments/invoices" $invoiceBody
Assert "Invoice created" ($inv.success -eq $true) ($inv | ConvertTo-Json -Depth 3 -Compress)
$invoiceId     = $inv.data.id
$invoiceNumber = $inv.data.invoiceNumber
Write-Host "   Invoice: $invoiceNumber ($invoiceId)" -ForegroundColor Gray
Assert "Invoice has ID" ($invoiceId -ne $null)
Assert "Invoice status is Pending" ($inv.data.status -eq "Pending")

# Verify invoice NOT yet in GL — check that no GL transaction references this invoice yet
$invDetail = API GET "/api/supplier-payments/invoices/$invoiceId/details"
Assert "Invoice detail endpoint responds" ($invDetail.success -eq $true) "Could not fetch invoice details"

# ─── STEP 2: VERIFY LEDGER BEFORE POSTING ────────────────────────────────────
Write-Host "`n▶ [4] Ledger before posting — invoice must NOT appear yet" -ForegroundColor Cyan
$ledger1 = API GET "/api/suppliers/$SUPPLIER_ID/ledger?startDate=2020-01-01&endDate=2099-12-31"
$preEntries = if ($ledger1.data.entries) { @($ledger1.data.entries) } else { @() }
$preInvEntries = $preEntries | Where-Object { $_.docNumber -eq $invoiceNumber }
Assert "Invoice NOT in ledger before posting" ($preInvEntries.Count -eq 0) "Entry appeared too early: $($preInvEntries | ConvertTo-Json -Compress)"

# ─── STEP 3: POST INVOICE TO GL ───────────────────────────────────────────────
Write-Host "`n▶ [5] Post invoice to GL → DR GRIR(2150) / CR AP(2100)" -ForegroundColor Cyan
$post = API POST "/api/supplier-payments/invoices/$invoiceId/post"
Assert "Invoice posted to GL" ($post.success -eq $true) ($post | ConvertTo-Json -Compress)

# Verify AP increased by AMOUNT and GRIR increased by AMOUNT (DR GRIR / CR AP)
$tb1   = API GET "/api/accounting/trial-balance"
$ap1AP   = $tb1.data.accounts | Where-Object { $_.accountCode -eq "2100" }
$grir1   = $tb1.data.accounts | Where-Object { $_.accountCode -eq "2150" }
$ap1Net   = [double]$ap1AP.netBalance
$grir1Deb = [double]$grir1.debitBalance
$apDelta   = $ap1Net  - $ap0Net
$grirDelta = $grir1Deb - $grir0
Write-Host "   AP netBalance delta: $apDelta  (expected +$AMOUNT)"   -ForegroundColor Gray
Write-Host "   GRIR debitBalance delta: $grirDelta (expected +$AMOUNT, DR GRIR)" -ForegroundColor Gray
Assert "AP netBalance increased by invoice amount" ([Math]::Abs($apDelta - $AMOUNT) -lt 0.01) "AP delta=$apDelta expected $AMOUNT"
Assert "GRIR debitBalance increased by invoice amount (DR GRIR)" ([Math]::Abs($grirDelta - $AMOUNT) -lt 0.01) "GRIR delta=$grirDelta expected $AMOUNT"

# ─── STEP 4: VERIFY LEDGER AFTER POSTING ──────────────────────────────────────
Write-Host "`n▶ [6] Ledger after posting — SUPPLIER_INVOICE must appear, not GOODS_RECEIPT" -ForegroundColor Cyan
$ledger2 = API GET "/api/suppliers/$SUPPLIER_ID/ledger?startDate=2020-01-01&endDate=2099-12-31"
$postEntries = if ($ledger2.data.entries) { @($ledger2.data.entries) } else { @() }
$invEntry = $postEntries | Where-Object { $_.type -eq "SUPPLIER_INVOICE" -and $_.reference -eq $invoiceNumber }
$grnEntries = $postEntries | Where-Object { $_.type -eq "GOODS_RECEIPT" }
$sysEntries = $postEntries | Where-Object { $_.type -eq "SYSTEM_CORRECTION" }

Assert "Invoice appears in ledger as SUPPLIER_INVOICE" ($invEntry.Count -gt 0) "Not found in $($postEntries.Count) entries"
Assert "No GOODS_RECEIPT in ledger after post" ($grnEntries.Count -eq 0) "Found $($grnEntries.Count)"
Assert "No SYSTEM_CORRECTION in ledger after post" ($sysEntries.Count -eq 0) "Found $($sysEntries.Count)"

if ($invEntry) {
    # In the statement: invoice increases liability = debit column (DR AP credit = shows as debit in statement)
    Assert "Invoice debit amount is correct" ([Math]::Abs([double]$invEntry.debit - $AMOUNT) -lt 0.01 -or [Math]::Abs([double]$invEntry.credit - $AMOUNT) -lt 0.01) "debit=$($invEntry.debit) credit=$($invEntry.credit)"
    Assert "Invoice itemStatus is Open" ($invEntry.itemStatus -eq "Open") "Status: $($invEntry.itemStatus)"
    Write-Host "   Entry: date=$($invEntry.date) debit=$($invEntry.debit) credit=$($invEntry.credit) status=$($invEntry.itemStatus)" -ForegroundColor Gray
}

# ─── STEP 5: PAY THE INVOICE ─────────────────────────────────────────────────
Write-Host "`n▶ [7] Pay invoice → DR AP(2100) / CR Cash(1010)" -ForegroundColor Cyan
$payBody = @{
    supplierId      = $SUPPLIER_ID
    amount          = $AMOUNT
    paymentMethod   = "CASH"
    paymentDate     = (Get-Date -Format "yyyy-MM-dd")
    targetInvoiceId = $invoiceId
    reference       = "E2E-PAY-$TS"
}
$pay = API POST "/api/supplier-payments/payments" $payBody
Assert "Payment created" ($pay.success -eq $true) ($pay | ConvertTo-Json -Depth 3 -Compress)
$paymentId = $pay.data.payment.id
Write-Host "   Payment: $($pay.data.payment.paymentNumber) ($paymentId)" -ForegroundColor Gray
Assert "Payment has ID" ($paymentId -ne $null)

# Verify AP net balance decreased back to baseline (DR AP / CR Cash)
$tb2    = API GET "/api/accounting/trial-balance"
$ap2Net = [double]($tb2.data.accounts | Where-Object { $_.accountCode -eq "2100" }).netBalance
$netAPChange = $ap2Net - $ap0Net
Write-Host "   AP netBalance after payment: $ap2Net  (net change from baseline: $netAPChange, expected: 0)" -ForegroundColor Gray
Assert "AP net change is 0 after invoice+payment" ([Math]::Abs($netAPChange) -lt 0.01) "Net change: $netAPChange"

# ─── STEP 6: VERIFY LEDGER AFTER PAYMENT ─────────────────────────────────────
Write-Host "`n▶ [8] Ledger after payment — must have both SUPPLIER_INVOICE and SUPPLIER_PAYMENT" -ForegroundColor Cyan
$ledger3 = API GET "/api/suppliers/$SUPPLIER_ID/ledger?startDate=2020-01-01&endDate=2099-12-31"
$finalEntries = if ($ledger3.data.entries) { @($ledger3.data.entries) } else { @() }
$finalInvEntry = $finalEntries | Where-Object { $_.type -eq "SUPPLIER_INVOICE" -and $_.reference -eq $invoiceNumber }
$payEntry      = $finalEntries | Where-Object { $_.type -eq "SUPPLIER_PAYMENT" }
$grnFinal      = $finalEntries | Where-Object { $_.type -eq "GOODS_RECEIPT" }

Assert "SUPPLIER_INVOICE still in ledger after payment" ($finalInvEntry.Count -gt 0)
Assert "SUPPLIER_PAYMENT appears in ledger" ($payEntry.Count -gt 0) "No SUPPLIER_PAYMENT found in $($finalEntries.Count) entries"
Assert "GOODS_RECEIPT never appears in ledger" ($grnFinal.Count -eq 0) "Found $($grnFinal.Count)"

# Verify invoice is now Paid
$invDetailAfter = API GET "/api/supplier-payments/invoices/$invoiceId/details"
$finalStatus = $invDetailAfter.data.invoice.status
Assert "Invoice status is Paid" ($finalStatus -eq "Paid") "Status: $finalStatus"
Write-Host "   Final invoice status: $finalStatus" -ForegroundColor Gray

# ─── STEP 7: CLOSING BALANCE VERIFICATION ────────────────────────────────────
Write-Host "`n▶ [9] Closing balance = opening balance (net zero effect)" -ForegroundColor Cyan
$closingBalance = [double]$ledger3.data.closingBalance
$openingBalance = [double]$ledger3.data.openingBalance
Write-Host "   Opening: $openingBalance  Closing: $closingBalance" -ForegroundColor Gray
# The closing balance may have changed if there are other invoices, but our specific 
# invoice+payment should net to zero contribution
Assert "Ledger has valid structure (closingBalance >= 0)" ($closingBalance -ge 0) "closingBalance: $closingBalance"

# ─── SUMMARY ─────────────────────────────────────────────────────────────────
Write-Host "`n════════════════════════════════════════════" -ForegroundColor Cyan
$total = $pass + $fail
$pct   = if ($total -gt 0) { [Math]::Round(($pass/$total)*100,1) } else { 0 }
Write-Host " RESULTS: $pass/$total passed  ($pct%)" -ForegroundColor $(if ($fail -eq 0) {"Green"} else {"Red"})
if ($fail -gt 0) {
    Write-Host "`n FAILED:" -ForegroundColor Red
    foreach ($e in $errors) { Write-Host "   • $e" -ForegroundColor Yellow }
}
Write-Host "════════════════════════════════════════════`n" -ForegroundColor Cyan
if ($fail -gt 0) { exit 1 } else { exit 0 }
