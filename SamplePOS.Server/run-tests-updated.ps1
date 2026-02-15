# Comprehensive API Test Suite (Updated for current API)
# Pre-req: Backend running on http://localhost:3001 and DB reachable

$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3001"

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  COMPREHENSIVE API TEST SUITE (Updated)" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

# TEST 0: Health Check
Write-Host "[TEST 0] Server Health Check..." -ForegroundColor Yellow
$healthResponse = Invoke-WebRequest -Uri "$baseUrl/health" -UseBasicParsing
Write-Host "   ✅ Server responding - Status: $($healthResponse.StatusCode)" -ForegroundColor Green

# TEST 1: Authentication - Login/Register
Write-Host "`n[TEST 1] Authentication - Login/Register..." -ForegroundColor Yellow
$testEmail = "tester@example.com"
$testPassword = "Password123!"
$testFullName = "Tester One"

try {
  $loginBody = @{ email = $testEmail; password = $testPassword } | ConvertTo-Json
  $loginResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
  $loginData = $loginResponse.Content | ConvertFrom-Json
  $token = $loginData.data.token
  $user = $loginData.data.user
  Write-Host "   ✅ Logged in" -ForegroundColor Green
} catch {
  Write-Host "   ℹ️  Login failed, attempting to register..." -ForegroundColor Cyan
  $registerBody = @{ email = $testEmail; password = $testPassword; fullName = $testFullName; role = "ADMIN" } | ConvertTo-Json
  $registerResponse = Invoke-WebRequest -Uri "$baseUrl/api/auth/register" -Method POST -Body $registerBody -ContentType "application/json" -UseBasicParsing
  $registerData = $registerResponse.Content | ConvertFrom-Json
  $token = $registerData.data.token
  $user = $registerData.data.user
  Write-Host "   ✅ Registered and authenticated" -ForegroundColor Green
}

if (-not $token) { throw "No token received" }
$authHeader = @{ "Authorization" = "Bearer $token" }
$authHeaderWithContent = @{ "Authorization" = "Bearer $token"; "Content-Type" = "application/json" }

# Profile (for user id)
$profileResp = Invoke-WebRequest -Uri "$baseUrl/api/auth/profile" -Headers $authHeader -UseBasicParsing
$profile = ($profileResp.Content | ConvertFrom-Json).data
$userId = $profile.id
Write-Host "   👤 User: $($profile.fullName) ($userId)" -ForegroundColor Gray

# TEST 2: Ensure supplier exists (or create one)
Write-Host "`n[TEST 2] Ensure Supplier..." -ForegroundColor Yellow
$suppliersResp = Invoke-WebRequest -Uri "$baseUrl/api/suppliers?page=1&limit=1" -Headers $authHeader -UseBasicParsing
$suppliersData = ($suppliersResp.Content | ConvertFrom-Json)
if ($suppliersData.success -and $suppliersData.data.Count -gt 0) {
  $supplierId = $suppliersData.data[0].id
  Write-Host "   ✅ Using supplier: $($suppliersData.data[0].name) ($supplierId)" -ForegroundColor Green
} else {
  $newSupplierBody = @{ name = "Test Supplier" } | ConvertTo-Json
  $createSupp = Invoke-WebRequest -Uri "$baseUrl/api/suppliers" -Method POST -Headers $authHeaderWithContent -Body $newSupplierBody -UseBasicParsing
  $supplierId = (($createSupp.Content | ConvertFrom-Json).data).id
  Write-Host "   ✅ Created supplier: $supplierId" -ForegroundColor Green
}

# TEST 3: Ensure product exists (or create one)
Write-Host "`n[TEST 3] Ensure Product..." -ForegroundColor Yellow
$productsResp = Invoke-WebRequest -Uri "$baseUrl/api/products?page=1&limit=1" -Headers $authHeader -UseBasicParsing
$productsData = ($productsResp.Content | ConvertFrom-Json)
if ($productsData.success -and $productsData.data.Count -gt 0) {
  $productId = $productsData.data[0].id
  $productName = $productsData.data[0].name
  Write-Host "   ✅ Using product: $productName ($productId)" -ForegroundColor Green
} else {
  $newProductBody = @{
    name = "Test Product"
    sku = "TEST-SKU-001"
    unitOfMeasure = "PIECE"
    costPrice = 10
    sellingPrice = 12
    costingMethod = "FIFO"
    taxRate = 0
    autoUpdatePrice = $false
    reorderLevel = 0
    trackExpiry = $false
    isActive = $true
  } | ConvertTo-Json
  $createProd = Invoke-WebRequest -Uri "$baseUrl/api/products" -Method POST -Headers $authHeaderWithContent -Body $newProductBody -UseBasicParsing
  $prod = ($createProd.Content | ConvertFrom-Json).data
  $productId = $prod.id
  $productName = $prod.name
  Write-Host "   ✅ Created product: $productName ($productId)" -ForegroundColor Green
}

# TEST 4: Create Purchase Order (adapts to controller schema)
Write-Host "`n[TEST 4] Create Purchase Order..." -ForegroundColor Yellow
$poBody = @{
  supplierId = $supplierId
  orderDate = (Get-Date).ToString("o")
  expectedDate = (Get-Date).AddDays(7).ToString("o")
  notes = "API test PO"
  createdBy = $userId
  items = @(
    @{
      productId = $productId
      productName = $productName
      quantity = 100
      unitCost = 25.50
    }
  )
} | ConvertTo-Json -Depth 10

$poResponse = Invoke-WebRequest -Uri "$baseUrl/api/purchase-orders" -Method POST -Headers $authHeaderWithContent -Body $poBody -UseBasicParsing
$po = ($poResponse.Content | ConvertFrom-Json).data
$poId = $po.po.id
$poNumber = $po.po.order_number
Write-Host "   ✅ PO Created - Number: $poNumber, Status: $($po.po.status)" -ForegroundColor Green

# TEST 5: Submit PO (DRAFT -> PENDING)
Write-Host "`n[TEST 5] Submit PO (DRAFT → PENDING)..." -ForegroundColor Yellow
$submitResp = Invoke-WebRequest -Uri "$baseUrl/api/purchase-orders/$poId/submit" -Method POST -Headers $authHeaderWithContent -UseBasicParsing
$poAfterSubmit = ($submitResp.Content | ConvertFrom-Json).data
Write-Host "   ✅ PO Status: $($poAfterSubmit.status)" -ForegroundColor Green

# TEST 6: Send PO to Supplier (creates GR DRAFT)
Write-Host "`n[TEST 6] Send PO to Supplier (auto-GR)..." -ForegroundColor Yellow
$sendResp = Invoke-WebRequest -Uri "$baseUrl/api/purchase-orders/$poId/send-to-supplier" -Method POST -Headers $authHeaderWithContent -UseBasicParsing
$sendData = ($sendResp.Content | ConvertFrom-Json).data
Write-Host "   ✅ GR Draft Created: $($sendData.goodsReceipt.receiptNumber) (Status: $($sendData.goodsReceipt.status))" -ForegroundColor Green

# TEST 7: Load GR created for this PO
Write-Host "`n[TEST 7] Load GR for PO..." -ForegroundColor Yellow
$grListResp = Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts?purchaseOrderId=$poId" -Headers $authHeader -UseBasicParsing
$grList = ($grListResp.Content | ConvertFrom-Json).data
if (-not $grList -or $grList.Count -eq 0) { throw "No GR found for PO $poId" }
$grId = $grList[0].id
Write-Host "   ✅ GR Found: $grId" -ForegroundColor Green

# Fetch GR details to get item IDs
$grDetailResp = Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts/$grId" -Headers $authHeader -UseBasicParsing
$grDetail = ($grDetailResp.Content | ConvertFrom-Json).data
$grItems = $grDetail.items
if (-not $grItems -or $grItems.Count -eq 0) { Write-Host "   ℹ️  GR has no items, hydrating from PO..." -ForegroundColor Cyan; Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts/$grId/hydrate-from-po" -Method POST -Headers $authHeaderWithContent -UseBasicParsing; $grDetail = ((Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts/$grId" -Headers $authHeader -UseBasicParsing).Content | ConvertFrom-Json).data; $grItems = $grDetail.items }

# TEST 8: Update GR items with received qty and unit cost
Write-Host "`n[TEST 8] Update GR Items..." -ForegroundColor Yellow
foreach ($item in $grItems) {
  $receivedQty = [Math]::Max(1, [int]([double]$item.orderedQuantity * 0.95))
  $updateBody = @{ receivedQuantity = $receivedQty; unitCost = [double]$item.unitCost } | ConvertTo-Json
  Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts/$grId/items/$($item.id)" -Method PUT -Headers $authHeaderWithContent -Body $updateBody -UseBasicParsing | Out-Null
}
Write-Host "   ✅ GR items updated" -ForegroundColor Green

# TEST 9: Finalize GR
Write-Host "`n[TEST 9] Finalize GR..." -ForegroundColor Yellow
$finalizeResp = Invoke-WebRequest -Uri "$baseUrl/api/goods-receipts/$grId/finalize" -Method POST -Headers $authHeaderWithContent -UseBasicParsing
$finalData = ($finalizeResp.Content | ConvertFrom-Json)
if (-not $finalData.success) { throw "Finalize failed: $($finalData.error)" }
Write-Host "   ✅ GR Finalized. Alerts: $([bool]($finalData.alerts))" -ForegroundColor Green

# TEST 10: Stock Level Check for Product
Write-Host "`n[TEST 10] Stock Level for Product..." -ForegroundColor Yellow
$stockResp = Invoke-WebRequest -Uri "$baseUrl/api/inventory/stock-levels/$productId" -Headers $authHeader -UseBasicParsing
$stock = ($stockResp.Content | ConvertFrom-Json).data
Write-Host "   ✅ Stock Level Loaded (productId=$productId)" -ForegroundColor Green

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  TEST SUITE COMPLETE (Updated)" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan
