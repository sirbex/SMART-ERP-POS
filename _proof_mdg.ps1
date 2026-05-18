$ErrorActionPreference = "Continue"
$base = "http://localhost:3001/api"
$AdminId = "7aa55a55-db98-4a9d-a743-d877c7d8dd21"

# Auth
$tok = (Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@samplepos.com","password":"admin123"}').data.accessToken
$H = @{Authorization="Bearer $tok"}
Write-Host "Token: $($tok.Length) chars"

$ProdA = "21b6af3b-5381-4c17-ab7d-24b89684344c"  # Test Product Delta - QoH=10, cost=0
$ProdB = "3078fd86-2874-43c3-87d9-a73f86a619b6"  # Paracetamol - QoH=5, selling_price=0, has cost

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "   MASTER DATA INTEGRITY GUARD — LIVE API PROOF" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White

# First reset ProdA back to zero cost (repair may have already run)
$env:PGPASSWORD="password"
psql -U postgres -d pos_system -c "UPDATE product_valuation SET cost_price=0, average_cost=0 WHERE product_id='$ProdA'; UPDATE product_inventory SET quantity_on_hand=10 WHERE product_id='$ProdA';" | Out-Null

# ====================================================================
Write-Host ""
Write-Host "PROOF 1: MDG-003 — GET /api/products/damaged" -ForegroundColor Cyan
$r1 = Invoke-RestMethod -Uri "$base/products/damaged" -Headers $H
Write-Host "  success : $($r1.success)   count : $($r1.count)"
foreach ($item in $r1.data) {
    Write-Host "  ITEM    : $($item.productName) | QoH=$($item.quantityOnHand) | cost=$($item.costPrice) | avg=$($item.averageCost)"
}
if ($r1.success -and $r1.count -gt 0) { Write-Host "  RESULT  : [PASS]" -ForegroundColor Green }
else { Write-Host "  RESULT  : [FAIL] expected >=1 item" -ForegroundColor Red }

# ====================================================================
Write-Host ""
Write-Host "PROOF 2: MDG-001 — ADJUSTMENT_OUT on zero-cost item BLOCKED" -ForegroundColor Cyan
$body2 = @{ productId=$ProdA; movementType="ADJUSTMENT_OUT"; quantity=1; notes="test write-off attempt"; createdBy=$AdminId } | ConvertTo-Json
try {
    $r2 = Invoke-RestMethod -Uri "$base/stock-movements" -Method POST -Headers $H -ContentType "application/json" -Body $body2
    Write-Host "  RESULT  : [FAIL] Not blocked — $($r2|ConvertTo-Json)" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { $msg = $_.ErrorDetails.Message }
    Write-Host "  HTTP=$code  Error=$msg"
    if ($code -ge 400 -and $msg -match "MDG-001") { Write-Host "  RESULT  : [PASS] MDG-001 code present" -ForegroundColor Green }
    elseif ($code -ge 400) { Write-Host "  RESULT  : [PARTIAL] Blocked HTTP $code but MDG-001 not in message" -ForegroundColor Yellow }
    else { Write-Host "  RESULT  : [FAIL]" -ForegroundColor Red }
}

# ====================================================================
Write-Host ""
Write-Host "PROOF 3: MDG-001b — ADJUSTMENT_IN without unitCost BLOCKED" -ForegroundColor Cyan
$body3 = @{ productId=$ProdA; movementType="ADJUSTMENT_IN"; quantity=5; notes="test no cost provided"; createdBy=$AdminId } | ConvertTo-Json
try {
    $r3 = Invoke-RestMethod -Uri "$base/stock-movements" -Method POST -Headers $H -ContentType "application/json" -Body $body3
    Write-Host "  RESULT  : [FAIL] Not blocked — $($r3|ConvertTo-Json)" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { $msg = $_.ErrorDetails.Message }
    Write-Host "  HTTP=$code  Error=$msg"
    if ($code -ge 400 -and $msg -match "MDG-001b") { Write-Host "  RESULT  : [PASS] MDG-001b code present" -ForegroundColor Green }
    elseif ($code -ge 400) { Write-Host "  RESULT  : [PARTIAL] Blocked HTTP $code but MDG-001b not in message" -ForegroundColor Yellow }
    else { Write-Host "  RESULT  : [FAIL]" -ForegroundColor Red }
}

# ====================================================================
Write-Host ""
Write-Host "PROOF 4: MDG-004 — Repair zero-cost item valuation" -ForegroundColor Cyan
$body4 = @{ unitCost=1500 } | ConvertTo-Json
try {
    $r4 = Invoke-RestMethod -Uri "$base/products/$ProdA/repair-valuation" -Method POST -Headers $H -ContentType "application/json" -Body $body4
    Write-Host "  success : $($r4.success)  message : $($r4.message)"
    if ($r4.data) { Write-Host "  unitCost=$($r4.data.unitCost)  glEntryId=$($r4.data.glEntryId)  product=$($r4.data.productName)" }
    if ($r4.success) { Write-Host "  RESULT  : [PASS] Repair + GL posted" -ForegroundColor Green }
    else { Write-Host "  RESULT  : [FAIL]" -ForegroundColor Red }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { $msg = $_.ErrorDetails.Message }
    Write-Host "  RESULT  : [FAIL] HTTP $code — $msg" -ForegroundColor Red
}

# ====================================================================
Write-Host ""
Write-Host "PROOF 5: MDG-002 — Sale with zero-price item BLOCKED" -ForegroundColor Cyan
$custResp = Invoke-RestMethod -Uri "$base/customers?limit=1" -Headers $H
$cust = $null
if ($custResp.data -is [array] -and $custResp.data.Count -gt 0) { $cust = $custResp.data[0] }
elseif ($custResp.data.data -is [array] -and $custResp.data.data.Count -gt 0) { $cust = $custResp.data.data[0] }
elseif ($custResp.data.items -is [array] -and $custResp.data.items.Count -gt 0) { $cust = $custResp.data.items[0] }
$saleItems = @(@{productId=$ProdB; productName="Paracetamol 500mg India/Strip"; quantity=1; unitPrice=0})
if ($cust) {
    $saleBody = @{ customerId=$cust.id; items=$saleItems; paymentMethod="CASH"; paymentReceived=0 } | ConvertTo-Json -Depth 3
    Write-Host "  Customer: $($cust.id)"
} else {
    $saleBody = @{ items=$saleItems; paymentMethod="CASH"; paymentReceived=0 } | ConvertTo-Json -Depth 3
    Write-Host "  (walk-in sale — no customer)"
}
try {
    $r5 = Invoke-RestMethod -Uri "$base/sales" -Method POST -Headers $H -ContentType "application/json" -Body $saleBody
    Write-Host "  RESULT  : [FAIL] Not blocked — $($r5|ConvertTo-Json -Depth 2)" -ForegroundColor Red
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    try { $errBody = $_.ErrorDetails.Message | ConvertFrom-Json; $msg = $errBody.error } catch { $msg = $_.ErrorDetails.Message }
    Write-Host "  HTTP=$code  Error=$msg"
    if ($code -ge 400 -and $msg -match "MDG-002") { Write-Host "  RESULT  : [PASS] MDG-002 code present" -ForegroundColor Green }
    elseif ($code -ge 400) { Write-Host "  RESULT  : [PARTIAL] Blocked HTTP $code but MDG-002 not in message" -ForegroundColor Yellow; Write-Host "  Raw: $($_.ErrorDetails.Message)" }
    else { Write-Host "  RESULT  : [FAIL]" -ForegroundColor Red }
}

# ====================================================================
Write-Host ""
Write-Host "PROOF 6: MDG-005 — Opening Stock Entry" -ForegroundColor Cyan
$body6 = @{ quantity=20; unitCost=500 } | ConvertTo-Json
try {
    $r6 = Invoke-RestMethod -Uri "$base/products/$ProdB/opening-stock" -Method POST -Headers $H -ContentType "application/json" -Body $body6
    Write-Host "  success : $($r6.success)  message : $($r6.message)"
    if ($r6.data) {
        Write-Host "  movementNumber=$($r6.data.movementNumber)  batchId=$($r6.data.batchId)"
        Write-Host "  glEntryId=$($r6.data.glEntryId)  totalValue=$($r6.data.totalValue)"
    }
    if ($r6.success) { Write-Host "  RESULT  : [PASS] Opening stock + GL posted" -ForegroundColor Green }
    else { Write-Host "  RESULT  : [FAIL]" -ForegroundColor Red }
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    try { $msg = ($_.ErrorDetails.Message | ConvertFrom-Json).error } catch { $msg = $_.ErrorDetails.Message }
    Write-Host "  RESULT  : [FAIL] HTTP $code — $msg" -ForegroundColor Red
}

# ====================================================================
Write-Host ""
Write-Host "VERIFY: Damaged scan after repair (should be 0)" -ForegroundColor Cyan
$r7 = Invoke-RestMethod -Uri "$base/products/damaged" -Headers $H
Write-Host "  count : $($r7.count)"
if ($r7.count -eq 0) { Write-Host "  RESULT  : [PASS] No damaged items remain" -ForegroundColor Green }
else { $r7.data | ForEach-Object { Write-Host "  Still damaged: $($_.productName)" -ForegroundColor Yellow } }

Write-Host ""
Write-Host "================================================================" -ForegroundColor White
Write-Host "   PROOF COMPLETE" -ForegroundColor White
Write-Host "================================================================" -ForegroundColor White
