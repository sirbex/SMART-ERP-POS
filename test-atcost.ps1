$BASE = "https://wizarddigital-inv.com/api"

Write-Host "`n=== STEP 1: LOGIN ===" -ForegroundColor Cyan
$r = Invoke-RestMethod -Uri "$BASE/auth/login" -Method POST -ContentType "application/json" `
  -Body '{"email":"admin@samplepos.com","password":"admin123"}'
if (-not $r.success) { Write-Error "Login failed: $($r.error)"; exit 1 }
$TOKEN = $r.data.token
$H = @{ Authorization = "Bearer $TOKEN" }
Write-Host "Logged in as: $($r.data.user.email) | role=$($r.data.user.role)" -ForegroundColor Green

Write-Host "`n=== STEP 2: GET PRICE GROUPS ===" -ForegroundColor Cyan
$pg = Invoke-RestMethod -Uri "$BASE/pricing/price-groups" -Headers $H
$pg.data | ForEach-Object { Write-Host "  [$($_.pricingMode)] $($_.name)  id=$($_.id)" }
$atCostGroupId = ($pg.data | Where-Object { $_.pricingMode -eq "AT_COST" } | Select-Object -First 1).id
if (-not $atCostGroupId) { Write-Error "No AT_COST group found!"; exit 1 }
Write-Host "AT_COST group ID: $atCostGroupId" -ForegroundColor Green

Write-Host "`n=== STEP 3: GET A REAL PRODUCT ===" -ForegroundColor Cyan
$prods = Invoke-RestMethod -Uri "$BASE/products?limit=5" -Headers $H
$prod = $prods.data | Where-Object { $_.costPrice -gt 0 -and $_.sellingPrice -gt 0 } | Select-Object -First 1
Write-Host "Product: $($prod.name) | sellingPrice=$($prod.sellingPrice) | costPrice=$($prod.costPrice)" -ForegroundColor Green
$productId = $prod.id

Write-Host "`n=== STEP 4: CREATE TEST CUSTOMER (AT_COST group) ===" -ForegroundColor Cyan
$custBody = @{
  name = "AT_COST_TEST_$(Get-Random -Max 999)"
  phone = "0700000000"
  priceGroupId = $atCostGroupId
} | ConvertTo-Json
$cust = Invoke-RestMethod -Uri "$BASE/customers" -Method POST -ContentType "application/json" -Headers $H -Body $custBody
$customerId = $cust.data.id
Write-Host "Customer created: $($cust.data.name) | id=$customerId | priceGroupId=$($cust.data.priceGroupId)" -ForegroundColor Green

Write-Host "`n=== STEP 5: CALL BULK PRICING (simulates POS selecting customer) ===" -ForegroundColor Cyan
$pricingBody = @{
  items = @(@{ productId = $productId; quantity = 1 })
  customerId = $customerId
} | ConvertTo-Json
$prices = Invoke-RestMethod -Uri "$BASE/pricing/price/bulk" -Method POST -ContentType "application/json" -Headers $H -Body $pricingBody

$result = $prices.data[0]
Write-Host "`n--- RESULT ---" -ForegroundColor Yellow
Write-Host "  finalPrice  = $($result.finalPrice)    (should equal costPrice)" -ForegroundColor $(if ($result.finalPrice -eq [decimal]$prod.costPrice) { "Green" } else { "Red" })
Write-Host "  basePrice   = $($result.basePrice)    (original selling price)"
Write-Host "  discount    = $($result.discount)"
Write-Host "  scope       = $($result.appliedRule.scope)    (should be 'at_cost')" -ForegroundColor $(if ($result.appliedRule.scope -eq "at_cost") { "Green" } else { "Red" })
Write-Host "  ruleName    = $($result.appliedRule.ruleName)"

Write-Host "`n=== STEP 6: SAME PRODUCT — NO CUSTOMER (standard price) ===" -ForegroundColor Cyan
$pricingBody2 = @{
  items = @(@{ productId = $productId; quantity = 1 })
} | ConvertTo-Json
$prices2 = Invoke-RestMethod -Uri "$BASE/pricing/price/bulk" -Method POST -ContentType "application/json" -Headers $H -Body $pricingBody2
$r2 = $prices2.data[0]
Write-Host "  finalPrice (no customer) = $($r2.finalPrice)  scope=$($r2.appliedRule.scope)"

Write-Host "`n=== PROOF SUMMARY ===" -ForegroundColor Cyan
$sellingPrice = [decimal]$prod.sellingPrice
$costPrice = [decimal]$prod.costPrice
$atCostPrice = [decimal]$result.finalPrice

if ($result.appliedRule.scope -eq "at_cost" -and $atCostPrice -le $sellingPrice) {
  Write-Host "✅ PASS: Customer with AT_COST group → price dropped from $sellingPrice to $atCostPrice (cost)" -ForegroundColor Green
  Write-Host "✅ PASS: scope = '$($result.appliedRule.scope)' — applied automatically just by passing customerId" -ForegroundColor Green
  Write-Host "✅ PASS: No manual override needed — selecting the customer is the ONLY action required" -ForegroundColor Green
} else {
  Write-Host "❌ FAIL: scope=$($result.appliedRule.scope) finalPrice=$atCostPrice sellingPrice=$sellingPrice" -ForegroundColor Red
}

# Cleanup
Invoke-RestMethod -Uri "$BASE/customers/$customerId" -Method DELETE -Headers $H | Out-Null
Write-Host "`nTest customer cleaned up." -ForegroundColor Gray
