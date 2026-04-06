#!/usr/bin/env pwsh
# Test script for Sale Refund API
# Usage: .\test-refund.ps1

$ErrorActionPreference = "Stop"
$BASE = "http://localhost:3001/api"
$headers = @{ "Content-Type" = "application/json" }

function Log($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Pass($msg) { Write-Host "  PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "  FAIL: $msg" -ForegroundColor Red }

# ── 1. Login ──────────────────────────────────────────────────
Log "1. Login"
$loginResp = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -Headers $headers -Body '{"email":"admin@smarterp.com","password":"admin123"}'
if (-not $loginResp.success) {
    Fail "Login failed"
    exit 1
}
$token = $loginResp.data.token
$authHeaders = @{ "Content-Type" = "application/json"; "Authorization" = "Bearer $token" }
Pass "Logged in as admin"

# ── 2. Create a sale to refund ────────────────────────────────
Log "2. Create a test sale"

# Find a product with stock
$products = Invoke-RestMethod -Uri "$BASE/products?limit=5" -Headers $authHeaders
$product = $products.data.data | Where-Object { $_.quantity_on_hand -gt 2 } | Select-Object -First 1
if (-not $product) {
    $product = $products.data.data | Select-Object -First 1
}
Write-Host "  Using product: $($product.name) (id=$($product.id), stock=$($product.quantity_on_hand))"

$userId = $loginResp.data.user.id

$saleBody = @{
    customerId = $null
    items = @(
        @{
            productId = $product.id
            productName = $product.name
            quantity = 2
            unitPrice = 5000
        }
    )
    paymentMethod = "CASH"
    paymentReceived = 10000
    soldBy = $userId
} | ConvertTo-Json -Depth 5

$saleResp = Invoke-RestMethod -Uri "$BASE/sales" -Method POST -Headers $authHeaders -Body $saleBody
if (-not $saleResp.success) {
    Fail "Sale creation failed: $($saleResp | ConvertTo-Json -Depth 3)"
    exit 1
}
$saleId = $saleResp.data.sale.id
$saleNumber = $saleResp.data.sale.saleNumber
Pass "Created sale $saleNumber (id=$saleId)"

# ── 3. Get sale details to find sale_item IDs ────────────────
Log "3. Get sale details"
$saleDetails = Invoke-RestMethod -Uri "$BASE/sales/$saleId" -Headers $authHeaders
$saleItems = $saleDetails.data.items
Write-Host "  Sale has $($saleItems.Count) item(s)"
$saleItemId = $saleItems[0].id
$saleItemQty = $saleItems[0].quantity
Write-Host "  Item ID: $saleItemId, qty: $saleItemQty"
Pass "Got sale items"

# ── 4. Test: Refund wrong sale status (should fail) ──────────
Log "4. Test refund on non-existent sale (expect 404)"
try {
    $fakeId = "00000000-0000-0000-0000-000000000001"
    $refundBody = @{
        items = @(@{ saleItemId = $saleItemId; quantity = 1 })
        reason = "Test refund on fake sale"
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri "$BASE/sales/$fakeId/refund" -Method POST -Headers $authHeaders -Body $refundBody
    Fail "Should have returned 404"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    if ($status -eq 404) { Pass "Got 404 as expected" }
    else { Fail "Expected 404, got $status" }
}

# ── 5. Test: Partial refund (1 of 2 units) ───────────────────
Log "5. Partial refund (1 of 2 units)"
$refundBody = @{
    items = @(@{ saleItemId = $saleItemId; quantity = 1 })
    reason = "Customer returned 1 unit - testing partial refund"
} | ConvertTo-Json -Depth 5

$refundResp = Invoke-RestMethod -Uri "$BASE/sales/$saleId/refund" -Method POST -Headers $authHeaders -Body $refundBody
if ($refundResp.success) {
    $refundNum = $refundResp.data.refund.refundNumber
    $isFullRefund = $refundResp.data.isFullRefund
    Pass "Partial refund created: $refundNum (isFullRefund=$isFullRefund)"
    if ($isFullRefund -eq $true) { Fail "Should NOT be full refund" }
} else {
    Fail "Partial refund failed: $($refundResp | ConvertTo-Json -Depth 3)"
    exit 1
}

# Verify sale still COMPLETED
$saleAfterPartial = Invoke-RestMethod -Uri "$BASE/sales/$saleId" -Headers $authHeaders
$statusAfterPartial = $saleAfterPartial.data.sale.status
Write-Host "  Sale status after partial refund: $statusAfterPartial"
if ($statusAfterPartial -eq "COMPLETED") { Pass "Sale still COMPLETED after partial refund" }
else { Fail "Expected COMPLETED, got $statusAfterPartial" }

# ── 6. Test: Refund remaining (1 more unit → full refund) ────
Log "6. Full refund (remaining 1 unit)"
$refundBody2 = @{
    items = @(@{ saleItemId = $saleItemId; quantity = 1 })
    reason = "Customer returned remaining unit - testing full refund"
} | ConvertTo-Json -Depth 5

$refundResp2 = Invoke-RestMethod -Uri "$BASE/sales/$saleId/refund" -Method POST -Headers $authHeaders -Body $refundBody2
if ($refundResp2.success) {
    $refundNum2 = $refundResp2.data.refund.refundNumber
    $isFullRefund2 = $refundResp2.data.isFullRefund
    Pass "Second refund created: $refundNum2 (isFullRefund=$isFullRefund2)"
    if ($isFullRefund2 -eq $true) { Pass "Correctly detected as full refund" }
    else { Fail "Should be full refund" }
} else {
    Fail "Second refund failed: $($refundResp2 | ConvertTo-Json -Depth 3)"
}

# Verify sale is now REFUNDED
$saleAfterFull = Invoke-RestMethod -Uri "$BASE/sales/$saleId" -Headers $authHeaders
$statusAfterFull = $saleAfterFull.data.sale.status
Write-Host "  Sale status after full refund: $statusAfterFull"
if ($statusAfterFull -eq "REFUNDED") { Pass "Sale status is REFUNDED" }
else { Fail "Expected REFUNDED, got $statusAfterFull" }

# ── 7. Test: Refund on REFUNDED sale (should fail) ───────────
Log "7. Test refund on REFUNDED sale (expect error)"
try {
    $refundBody3 = @{
        items = @(@{ saleItemId = $saleItemId; quantity = 1 })
        reason = "Should not work"
    } | ConvertTo-Json -Depth 5
    Invoke-RestMethod -Uri "$BASE/sales/$saleId/refund" -Method POST -Headers $authHeaders -Body $refundBody3
    Fail "Should have failed on REFUNDED sale"
} catch {
    $status = $_.Exception.Response.StatusCode.value__
    Pass "Correctly rejected refund on REFUNDED sale (status=$status)"
}

# ── 8. Verify DB state ───────────────────────────────────────
Log "8. Verify database state"
$dbCheck = psql -U postgres -d pos_system -t -A -c "SELECT refund_number, total_amount, status FROM sale_refunds WHERE sale_id = '$saleId' ORDER BY created_at"
Write-Host "  Refunds in DB:"
$dbCheck | ForEach-Object { Write-Host "    $_" }

$itemCheck = psql -U postgres -d pos_system -t -A -c "SELECT id, quantity, refunded_qty FROM sale_items WHERE sale_id = '$saleId'"
Write-Host "  Sale items refunded_qty:"
$itemCheck | ForEach-Object { Write-Host "    $_" }

Log "ALL TESTS COMPLETE"
