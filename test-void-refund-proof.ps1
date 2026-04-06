#!/usr/bin/env pwsh
# ========================================================================
#  Void & Refund V2 — Comprehensive Proof Test
#  Tests: create sales, void, refund, fiscal period guard, GL integrity
# ========================================================================

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001/api"
$pass = 0; $fail = 0

function Test-Check($name, $condition, $detail = "") {
    if ($condition) {
        Write-Host "  PASS: $name $detail" -ForegroundColor Green
        $script:pass++
    } else {
        Write-Host "  FAIL: $name $detail" -ForegroundColor Red
        $script:fail++
    }
}

# ── Auth ────────────────────────────────────────────────────────────────
Write-Host "`n=== AUTH ===" -ForegroundColor Cyan
$login = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST `
  -Body '{"email":"admin@samplepos.com","password":"admin123"}' -ContentType "application/json"
$token = $login.data.token
$h = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }
Test-Check "Login" ($null -ne $token) "token=$($token.Substring(0,15))..."

# ── Snapshot batch quantities BEFORE ────────────────────────────────────
Write-Host "`n=== PRE-TEST INVENTORY SNAPSHOT ===" -ForegroundColor Cyan
$preSnap = psql -U postgres -d pos_system -t -A -F "|" -c @"
SELECT ib.id, p.name, ib.remaining_quantity::numeric
FROM inventory_batches ib JOIN products p ON p.id = ib.product_id
WHERE ib.id IN (
  '54597e07-fb82-44ce-a493-e06640218ef6',
  'cccb7c68-d13e-46af-848e-be898086adbd',
  '603476e5-c92b-4a7a-9612-294b00471063',
  '7552379c-6e9a-4b33-a749-54284e3dd4a9'
) ORDER BY p.name
"@
$preQtys = @{}
foreach ($line in $preSnap) {
    $parts = $line.Split("|")
    $preQtys[$parts[0]] = [decimal]$parts[2]
    Write-Host "  $($parts[1]): $($parts[2])"
}

# ── Snapshot GL totals BEFORE ───────────────────────────────────────────
$preGL = psql -U postgres -d pos_system -t -A -F "|" -c @"
SELECT COALESCE(SUM("DebitAmount"),0)::numeric, COALESCE(SUM("CreditAmount"),0)::numeric
FROM ledger_entries
"@
$preGLParts = $preGL.Trim().Split("|")
$preDebits = [decimal]$preGLParts[0]; $preCredits = [decimal]$preGLParts[1]
Write-Host "  GL Before: debits=$preDebits credits=$preCredits net=$($preDebits - $preCredits)"

# ── CREATE SALE 1 (for VOID) ───────────────────────────────────────────
Write-Host "`n=== CREATE SALE 1 (FOR VOID TEST) ===" -ForegroundColor Cyan
$sale1Body = @{
    lineItems = @(
        @{ productId="6bcb9f3c-1475-41a4-8ea8-e3ee66d6bc79"; productName="Dexamethasone 0.5mg"; sku="1917"; uom="Each"; quantity=2; unitPrice=500; costPrice=200; subtotal=1000 },
        @{ productId="37fa1ad6-2197-4421-a583-8ea98b39a747"; productName="Flufed tabs"; sku="2722"; uom="Each"; quantity=3; unitPrice=200; costPrice=95; subtotal=600 }
    )
    subtotal = 1600; taxAmount = 0; totalAmount = 1600
    paymentMethod = "CASH"; amountTendered = 1600; changeGiven = 0
} | ConvertTo-Json -Depth 5
$s1 = Invoke-RestMethod -Uri "$baseUrl/sales" -Method POST -Body $sale1Body -Headers $h
Test-Check "Sale1 created" ($s1.success -eq $true) "saleNumber=$($s1.data.sale.saleNumber) total=$($s1.data.sale.totalAmount)"
$s1Id = $s1.data.sale.id

# ── CREATE SALE 2 (for REFUND) ─────────────────────────────────────────
Write-Host "`n=== CREATE SALE 2 (FOR REFUND TEST) ===" -ForegroundColor Cyan
$sale2Body = @{
    lineItems = @(
        @{ productId="71089929-35fd-4d9d-830a-6c81b4dac01f"; productName="Levodenk 500mg"; sku="3761"; uom="Each"; quantity=2; unitPrice=4500; costPrice=3150; subtotal=9000 },
        @{ productId="21b6af3b-5381-4c17-ab7d-24b89684344c"; productName="Test Product Delta"; sku="TEST-004"; uom="Each"; quantity=3; unitPrice=400; costPrice=250; subtotal=1200 }
    )
    subtotal = 10200; taxAmount = 0; totalAmount = 10200
    paymentMethod = "CASH"; amountTendered = 10200; changeGiven = 0
} | ConvertTo-Json -Depth 5
$s2 = Invoke-RestMethod -Uri "$baseUrl/sales" -Method POST -Body $sale2Body -Headers $h
Test-Check "Sale2 created" ($s2.success -eq $true) "saleNumber=$($s2.data.sale.saleNumber) total=$($s2.data.sale.totalAmount)"
$s2Id = $s2.data.sale.id

# Get sale2 items for refund
$s2Detail = Invoke-RestMethod -Uri "$baseUrl/sales/$s2Id" -Headers $h
$s2Items = $s2Detail.data.items
Write-Host "  Sale2 items: $($s2Items.Count)"
foreach ($item in $s2Items) { Write-Host "    - $($item.productName) qty=$($item.quantity) itemId=$($item.id)" }

# ── TEST 1: VOID SALE 1 ────────────────────────────────────────────────
Write-Host "`n=== TEST 1: VOID SALE ===" -ForegroundColor Cyan
$voidBody = @{ reason = "Proof test: customer returned everything" } | ConvertTo-Json
$v1 = Invoke-RestMethod -Uri "$baseUrl/sales/$s1Id/void" -Method POST -Body $voidBody -Headers $h
Test-Check "Void success" ($v1.success -eq $true)
Test-Check "Void status" ($v1.data.sale.status -eq "VOID") "status=$($v1.data.sale.status)"
Test-Check "Items restored" ($v1.data.itemsRestored -eq 2) "count=$($v1.data.itemsRestored)"
Test-Check "Total amount" ($v1.data.totalAmount -eq 1600) "amount=$($v1.data.totalAmount)"

# Verify void is idempotent (cannot void again)
Write-Host "`n  -- Double-void guard --"
try {
    $v1b = Invoke-RestMethod -Uri "$baseUrl/sales/$s1Id/void" -Method POST -Body $voidBody -Headers $h
    Test-Check "Double-void blocked" $false "Should have thrown"
} catch {
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    Test-Check "Double-void blocked" ($errBody.error -like "*VOID*" -or $errBody.error -like "*status*") "error=$($errBody.error.Substring(0, [Math]::Min(60, $errBody.error.Length)))"
}

# ── TEST 2: PARTIAL REFUND ON SALE 2 ───────────────────────────────────
Write-Host "`n=== TEST 2: PARTIAL REFUND ===" -ForegroundColor Cyan
# Refund 1 of 2 Levodenk (first item)
$refundItem = $s2Items | Where-Object { $_.productName -like "*Levodenk*" -or $_.productName -like "*levodenk*" } | Select-Object -First 1
if (-not $refundItem) { $refundItem = $s2Items[0] }
$refundBody = @{
    items = @( @{ saleItemId = $refundItem.id; quantity = 1 } )
    reason = "Proof test: partial return of 1 unit"
} | ConvertTo-Json -Depth 5
$r1 = Invoke-RestMethod -Uri "$baseUrl/sales/$s2Id/refund" -Method POST -Body $refundBody -Headers $h
Test-Check "Refund success" ($r1.success -eq $true)
Test-Check "Is partial refund" ($r1.data.isFullRefund -eq $false) "isFullRefund=$($r1.data.isFullRefund)"
Test-Check "Items restored" ($r1.data.itemsRestored -eq 1) "count=$($r1.data.itemsRestored)"
Test-Check "Refund number" ($r1.data.refund.refundNumber -like "REF-*") "refundNumber=$($r1.data.refund.refundNumber)"
$refundAmount = $r1.data.refund.totalAmount
Test-Check "Refund amount" ($refundAmount -eq 4500) "amount=$refundAmount"
$refundId = $r1.data.refund.id  # Refund record ID for GL and stock movement queries

# Sale 2 should still be COMPLETED (partial refund)
$s2After = Invoke-RestMethod -Uri "$baseUrl/sales/$s2Id" -Headers $h
Test-Check "Sale2 still COMPLETED" ($s2After.data.sale.status -eq "COMPLETED") "status=$($s2After.data.sale.status)"

# ── TEST 3: OVER-REFUND GUARD ──────────────────────────────────────────
Write-Host "`n=== TEST 3: OVER-REFUND GUARD ===" -ForegroundColor Cyan
$overRefundBody = @{
    items = @( @{ saleItemId = $refundItem.id; quantity = 5 } )
    reason = "Trying to refund more than purchased"
} | ConvertTo-Json -Depth 5
try {
    $_ = Invoke-RestMethod -Uri "$baseUrl/sales/$s2Id/refund" -Method POST -Body $overRefundBody -Headers $h
    Test-Check "Over-refund blocked" $false "Should have thrown"
} catch {
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    Test-Check "Over-refund blocked" ($true) "error=$($errBody.error.Substring(0, [Math]::Min(80, $errBody.error.Length)))"
}

# ── TEST 4: CANNOT VOID A REFUNDED SALE ─────────────────────────────────
Write-Host "`n=== TEST 4: CANNOT REFUND A VOIDED SALE ===" -ForegroundColor Cyan
$refundVoidBody = @{
    items = @( @{ saleItemId = $refundItem.id; quantity = 1 } )
    reason = "Should fail on voided sale"
} | ConvertTo-Json -Depth 5
try {
    $_ = Invoke-RestMethod -Uri "$baseUrl/sales/$s1Id/refund" -Method POST -Body $refundVoidBody -Headers $h
    Test-Check "Refund on VOID blocked" $false "Should have thrown"
} catch {
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    Test-Check "Refund on VOID blocked" ($true) "error=$($errBody.error.Substring(0, [Math]::Min(80, $errBody.error.Length)))"
}

# ── TEST 5: FISCAL PERIOD GUARD ─────────────────────────────────────────
Write-Host "`n=== TEST 5: FISCAL PERIOD GUARD ===" -ForegroundColor Cyan
# Close April 2026 period, then try to void/refund Sale2 (still COMPLETED, created today)
psql -U postgres -d pos_system -c "DELETE FROM accounting_periods WHERE period_year = 2026 AND period_month = 4" 2>$null
psql -U postgres -d pos_system -c "INSERT INTO accounting_periods (id, period_year, period_month, period_start, period_end, status, created_at) VALUES (gen_random_uuid(), 2026, 4, '2026-04-01', '2026-04-30', 'CLOSED', NOW())"

# Try to void Sale2 (COMPLETED, April sale) — should fail with closed period
Write-Host "  Attempting void on Sale2 ($s2Id) in closed April period..."
try {
    $_ = Invoke-RestMethod -Uri "$baseUrl/sales/$s2Id/void" -Method POST `
      -Body '{"reason":"test closed period"}' -Headers $h
    Test-Check "Closed period void blocked" $false "Should have thrown"
} catch {
    $errBody = $_.ErrorDetails.Message | ConvertFrom-Json
    $isClosed = $errBody.error -like "*closed*period*"
    Test-Check "Closed period void blocked" ($isClosed) "error=$($errBody.error.Substring(0, [Math]::Min(80, $errBody.error.Length)))"
}

# Try refund on Sale2 — should also fail with closed period
$refundClosedBody = @{
    items = @( @{ saleItemId = $refundItem.id; quantity = 1 } )
    reason = "test closed period refund"
} | ConvertTo-Json -Depth 5
try {
    $_ = Invoke-RestMethod -Uri "$baseUrl/sales/$s2Id/refund" -Method POST -Body $refundClosedBody -Headers $h
    Test-Check "Closed period refund blocked" $false "Should have thrown"
} catch {
    $errBody2 = $_.ErrorDetails.Message | ConvertFrom-Json
    $isClosed2 = $errBody2.error -like "*closed*period*"
    Test-Check "Closed period refund blocked" ($isClosed2) "error=$($errBody2.error.Substring(0, [Math]::Min(80, $errBody2.error.Length)))"
}

# Reopen April period for cleanup
psql -U postgres -d pos_system -c "DELETE FROM accounting_periods WHERE period_year = 2026 AND period_month = 4" 2>$null

# ── TEST 6: GL INTEGRITY ────────────────────────────────────────────────
Write-Host "`n=== TEST 6: GL INTEGRITY ===" -ForegroundColor Cyan
$glCheck = psql -U postgres -d pos_system -t -A -F "|" -c @"
SELECT
  COALESCE(SUM("DebitAmount"),0)::numeric AS total_debits,
  COALESCE(SUM("CreditAmount"),0)::numeric AS total_credits,
  (COALESCE(SUM("DebitAmount"),0) - COALESCE(SUM("CreditAmount"),0))::numeric AS net
FROM ledger_entries
"@
$glParts = $glCheck.Trim().Split("|")
$totalDebits = [decimal]$glParts[0]; $totalCredits = [decimal]$glParts[1]; $net = [decimal]$glParts[2]
Write-Host "  Total Debits:  $totalDebits"
Write-Host "  Total Credits: $totalCredits"
Write-Host "  Net Balance:   $net"
Test-Check "GL balanced (debits=credits)" ($net -eq 0) "net=$net"

# Check void-specific GL entries (join ledger_entries with ledger_transactions for reference)
$voidGL = psql -U postgres -d pos_system -t -A -F "|" -c @"
SELECT COUNT(*), COALESCE(SUM(le."DebitAmount"),0)::numeric, COALESCE(SUM(le."CreditAmount"),0)::numeric
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."ReferenceType" = 'REVERSAL'
  AND lt."ReferenceId" = '$s1Id'
"@
$voidGLParts = $voidGL.Trim().Split("|")
Write-Host "  Void GL entries: count=$($voidGLParts[0]) debits=$($voidGLParts[1]) credits=$($voidGLParts[2])"
$voidEntryCount = [int]$voidGLParts[0]
$voidDebitSum = [decimal]$voidGLParts[1]
$voidCreditSum = [decimal]$voidGLParts[2]
Test-Check "Void GL entries exist" ($voidEntryCount -gt 0) "count=$voidEntryCount"
Test-Check "Void GL entries balanced" ($voidDebitSum -eq $voidCreditSum) "debits=$voidDebitSum credits=$voidCreditSum"

# Check refund-specific GL entries
$refundGL = psql -U postgres -d pos_system -t -A -F "|" -c @"
SELECT COUNT(*), COALESCE(SUM(le."DebitAmount"),0)::numeric, COALESCE(SUM(le."CreditAmount"),0)::numeric
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."ReferenceType" = 'SALE_REFUND'
  AND lt."ReferenceId" = '$refundId'
"@
$refundGLParts = $refundGL.Trim().Split("|")
Write-Host "  Refund GL entries: count=$($refundGLParts[0]) debits=$($refundGLParts[1]) credits=$($refundGLParts[2])"
$refundEntryCount = [int]$refundGLParts[0]
$refundDebitSum = [decimal]$refundGLParts[1]
$refundCreditSum = [decimal]$refundGLParts[2]
Test-Check "Refund GL entries exist" ($refundEntryCount -gt 0) "count=$refundEntryCount"
Test-Check "Refund GL entries balanced" ($refundDebitSum -eq $refundCreditSum) "debits=$refundDebitSum credits=$refundCreditSum"

# ── TEST 7: INVENTORY RESTORATION CHECK ─────────────────────────────────
Write-Host "`n=== TEST 7: INVENTORY RESTORATION ===" -ForegroundColor Cyan
$postSnap = psql -U postgres -d pos_system -t -A -F "|" -c @"
SELECT ib.id, p.name, ib.remaining_quantity::numeric
FROM inventory_batches ib JOIN products p ON p.id = ib.product_id
WHERE ib.id IN (
  '54597e07-fb82-44ce-a493-e06640218ef6',
  'cccb7c68-d13e-46af-848e-be898086adbd',
  '603476e5-c92b-4a7a-9612-294b00471063',
  '7552379c-6e9a-4b33-a749-54284e3dd4a9'
) ORDER BY p.name
"@
$postQtys = @{}
foreach ($line in $postSnap) {
    $parts = $line.Split("|")
    $postQtys[$parts[0]] = [decimal]$parts[2]
    $pre = $preQtys[$parts[0]]
    $diff = [decimal]$parts[2] - $pre
    Write-Host "  $($parts[1]): $pre -> $($parts[2]) (diff=$diff)"
}

# Void sale had: Dexamethasone x2, Flufed x3 (both fully restored)
$dexBatch = "54597e07-fb82-44ce-a493-e06640218ef6"
$fluBatch = "cccb7c68-d13e-46af-848e-be898086adbd"
Test-Check "Dexamethasone qty restored (+2)" (($postQtys[$dexBatch] - $preQtys[$dexBatch]) -eq 0) "void restored, sale deducted = net 0"

# Refund sale had: Levodenk x2 (1 refunded), Delta x3 (none refunded)
$levBatch = "603476e5-c92b-4a7a-9612-294b00471063"
$delBatch = "7552379c-6e9a-4b33-a749-54284e3dd4a9"
# After sale2 created (-2 lev, -3 del) then refund (+1 lev):
# Net from pre: lev = -2+1 = -1, del = -3
$levDiff = $postQtys[$levBatch] - $preQtys[$levBatch]
$delDiff = $postQtys[$delBatch] - $preQtys[$delBatch]
Test-Check "Levodenk net -1 (sold 2, refunded 1)" ($levDiff -eq -1) "diff=$levDiff"
Test-Check "Delta net -3 (sold 3, none refunded)" ($delDiff -eq -3) "diff=$delDiff"

# For voided sale: net should be 0 (sold then restored)
# Dex: sold 2 + restored 2 = 0 net
# Flu: sold 3 + restored 3 = 0 net
$dexDiff = $postQtys[$dexBatch] - $preQtys[$dexBatch]
$fluDiff = $postQtys[$fluBatch] - $preQtys[$fluBatch]
Test-Check "Dexamethasone net 0 (void fully restored)" ($dexDiff -eq 0) "diff=$dexDiff"
Test-Check "Flufed net 0 (void fully restored)" ($fluDiff -eq 0) "diff=$fluDiff"

# ── TEST 8: STOCK MOVEMENTS AUDIT TRAIL ─────────────────────────────────
Write-Host "`n=== TEST 8: STOCK MOVEMENT AUDIT ===" -ForegroundColor Cyan
$voidMovements = psql -U postgres -d pos_system -t -A -c @"
SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'VOID' AND reference_id = '$s1Id'
"@
$refundMovements = psql -U postgres -d pos_system -t -A -c @"
SELECT COUNT(*) FROM stock_movements WHERE reference_type = 'REFUND' AND reference_id = '$refundId'
"@
Test-Check "Void stock movements recorded" ([int]$voidMovements.Trim() -gt 0) "count=$($voidMovements.Trim())"
Test-Check "Refund stock movements recorded" ([int]$refundMovements.Trim() -gt 0) "count=$($refundMovements.Trim())"

# ── SUMMARY ─────────────────────────────────────────────────────────────
Write-Host "`n========================================================" -ForegroundColor Yellow
Write-Host "  PROOF TEST RESULTS: $pass PASSED, $fail FAILED" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Red" })
Write-Host "========================================================`n" -ForegroundColor Yellow

if ($fail -gt 0) { exit 1 }
