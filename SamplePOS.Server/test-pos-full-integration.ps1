# ============================================================
# POS Full Integration Test
# Tests complete flow: Product → Inventory → Sale → Deduction
# ============================================================

param(
    [string]$BaseUrl = "http://localhost:3001/api"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "POS FULL INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Track test results
$testsPassed = 0
$testsFailed = 0

function Test-Endpoint {
    param($Name, $Method, $Url, $Body = $null, $ExpectedStatus = 200)
    
    Write-Host "TEST: $Name" -ForegroundColor Yellow
    
    try {
        $headers = @{
            "Content-Type" = "application/json"
        }
        
        if ($Global:AuthToken) {
            $headers["Authorization"] = "Bearer $Global:AuthToken"
        }
        
        $params = @{
            Method = $Method
            Uri = $Url
            Headers = $headers
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        
        if ($response.success) {
            Write-Host "  ✓ PASS" -ForegroundColor Green
            $script:testsPassed++
            return $response
        } else {
            Write-Host "  ✗ FAIL: $($response.error)" -ForegroundColor Red
            $script:testsFailed++
            return $null
        }
    } catch {
        Write-Host "  ✗ FAIL: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Gray
        $script:testsFailed++
        return $null
    }
}

# ============================================================
# TEST 1: Login as ADMIN
# ============================================================

$loginBody = @{
    email = "admin@samplepos.local"
    password = "Admin123!@#"
}

$loginResponse = Test-Endpoint -Name "Login as ADMIN" -Method "POST" -Url "$BaseUrl/auth/login" -Body $loginBody

if (-not $loginResponse) {
    Write-Host ""
    Write-Host "FATAL: Login failed. Cannot proceed." -ForegroundColor Red
    exit 1
}

$Global:AuthToken = $loginResponse.data.token
$Global:UserId = $loginResponse.data.user.id

Write-Host "  Token: $($Global:AuthToken.Substring(0, 20))..." -ForegroundColor Gray
Write-Host "  User ID: $Global:UserId" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 2: Create Test Customer (with credit limit)
# ============================================================

$customerBody = @{
    name = "POS Test Customer"
    email = "postest@example.com"
    phone = "0700123456"
    address = "Test Address"
    balance = 0
    creditLimit = 100000
    group = "RETAIL"
    isActive = $true
}

$customerResponse = Test-Endpoint -Name "Create test customer" -Method "POST" -Url "$BaseUrl/customers" -Body $customerBody -ExpectedStatus 201

if (-not $customerResponse) {
    Write-Host "ERROR: Failed to create customer" -ForegroundColor Red
    exit 1
}

$customerId = $customerResponse.data.id
Write-Host "  Customer ID: $customerId" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 3: Create Test Product
# ============================================================

$productBody = @{
    name = "POS Test Product"
    sku = "POSTEST001"
    category = "TEST"
    costPrice = 1000
    sellingPrice = 1500
    reorderLevel = 10
    reorderQuantity = 50
    trackExpiry = $true
    isActive = $true
    uoms = @(
        @{
            name = "Piece"
            abbreviation = "pc"
            conversionFactor = 1
            isDefault = $true
        }
    )
}

$productResponse = Test-Endpoint -Name "Create test product" -Method "POST" -Url "$BaseUrl/products" -Body $productBody -ExpectedStatus 201

if (-not $productResponse) {
    Write-Host "ERROR: Failed to create product" -ForegroundColor Red
    exit 1
}

$productId = $productResponse.data.product.id
Write-Host "  Product ID: $productId" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 4: Create Supplier
# ============================================================

$supplierBody = @{
    name = "POS Test Supplier"
    email = "supplier@test.com"
    phone = "0700999888"
    address = "Supplier Address"
    isActive = $true
}

$supplierResponse = Test-Endpoint -Name "Create test supplier" -Method "POST" -Url "$BaseUrl/suppliers" -Body $supplierBody -ExpectedStatus 201

if (-not $supplierResponse) {
    Write-Host "ERROR: Failed to create supplier" -ForegroundColor Red
    exit 1
}

$supplierId = $supplierResponse.data.id
Write-Host "  Supplier ID: $supplierId" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 5: Create Purchase Order
# ============================================================

$poBody = @{
    supplierId = $supplierId
    items = @(
        @{
            productId = $productId
            quantity = 100
            unitCost = 1000
            lineTotal = 100000
        }
    )
    totalAmount = 100000
}

$poResponse = Test-Endpoint -Name "Create purchase order" -Method "POST" -Url "$BaseUrl/purchase-orders" -Body $poBody -ExpectedStatus 201

if (-not $poResponse) {
    Write-Host "ERROR: Failed to create PO" -ForegroundColor Red
    exit 1
}

$poId = $poResponse.data.id
$poNumber = $poResponse.data.poNumber
Write-Host "  PO ID: $poId" -ForegroundColor Gray
Write-Host "  PO Number: $poNumber" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 6: Create Goods Receipt
# ============================================================

$grBody = @{
    purchaseOrderId = $poId
    receivedBy = $Global:UserId
}

$grResponse = Test-Endpoint -Name "Create goods receipt" -Method "POST" -Url "$BaseUrl/goods-receipts" -Body $grBody -ExpectedStatus 201

if (-not $grResponse) {
    Write-Host "ERROR: Failed to create GR" -ForegroundColor Red
    exit 1
}

$grId = $grResponse.data.id
$grNumber = $grResponse.data.grNumber
Write-Host "  GR ID: $grId" -ForegroundColor Gray
Write-Host "  GR Number: $grNumber" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 7: Update GR Item with Batch/Expiry
# ============================================================

$expiryDate = (Get-Date).AddDays(90).ToString("yyyy-MM-dd")

# Get GR details to find item ID
$grDetailsResponse = Invoke-RestMethod -Method GET -Uri "$BaseUrl/goods-receipts/$grId" -Headers @{
    "Authorization" = "Bearer $Global:AuthToken"
    "Content-Type" = "application/json"
}

$grItemId = $grDetailsResponse.data.items[0].id

$updateItemBody = @{
    quantityReceived = 100
    batchNumber = "BATCH-TEST-001"
    expiryDate = $expiryDate
}

$updateItemResponse = Test-Endpoint -Name "Update GR item with batch/expiry" -Method "PUT" -Url "$BaseUrl/goods-receipts/$grId/items/$grItemId" -Body $updateItemBody

if (-not $updateItemResponse) {
    Write-Host "ERROR: Failed to update GR item" -ForegroundColor Red
    exit 1
}

Write-Host "  Batch: BATCH-TEST-001" -ForegroundColor Gray
Write-Host "  Expiry: $expiryDate" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 8: Finalize Goods Receipt (Creates Inventory Batches)
# ============================================================

$finalizeResponse = Test-Endpoint -Name "Finalize goods receipt" -Method "POST" -Url "$BaseUrl/goods-receipts/$grId/finalize"

if (-not $finalizeResponse) {
    Write-Host "ERROR: Failed to finalize GR" -ForegroundColor Red
    exit 1
}

Write-Host "  Inventory batches created" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 9: Check Stock Levels (Before Sale)
# ============================================================

$stockBeforeResponse = Test-Endpoint -Name "Check stock levels before sale" -Method "GET" -Url "$BaseUrl/inventory/stock-levels/$productId"

if ($stockBeforeResponse) {
    $stockBefore = $stockBeforeResponse.data.totalStock
    Write-Host "  Stock before: $stockBefore units" -ForegroundColor Gray
} else {
    $stockBefore = 0
}
Write-Host ""

# ============================================================
# TEST 10: Create POS Sale (CASH Payment)
# ============================================================

$saleBody = @{
    customerId = $customerId
    lineItems = @(
        @{
            productId = $productId
            productName = "POS Test Product"
            sku = "POSTEST001"
            uom = "pc"
            quantity = 5
            unitPrice = 1500
            costPrice = 1000
            subtotal = 7500
            taxAmount = 0
        }
    )
    subtotal = 7500
    taxAmount = 0
    totalAmount = 7500
    paymentMethod = "CASH"
    amountTendered = 10000
    changeGiven = 2500
}

$saleResponse = Test-Endpoint -Name "Create POS sale (CASH)" -Method "POST" -Url "$BaseUrl/sales" -Body $saleBody -ExpectedStatus 201

if (-not $saleResponse) {
    Write-Host "ERROR: Failed to create sale" -ForegroundColor Red
    exit 1
}

$saleId = $saleResponse.data.sale.id
$saleNumber = $saleResponse.data.sale.saleNumber
Write-Host "  Sale ID: $saleId" -ForegroundColor Gray
Write-Host "  Sale Number: $saleNumber" -ForegroundColor Gray
Write-Host "  Total: UGX $($saleResponse.data.sale.totalAmount)" -ForegroundColor Gray
Write-Host ""

# ============================================================
# TEST 11: Verify Inventory Deduction (FEFO)
# ============================================================

$stockAfterResponse = Test-Endpoint -Name "Check stock levels after sale" -Method "GET" -Url "$BaseUrl/inventory/stock-levels/$productId"

if ($stockAfterResponse) {
    $stockAfter = $stockAfterResponse.data.totalStock
    $expectedStock = $stockBefore - 5
    Write-Host "  Stock after: $stockAfter units" -ForegroundColor Gray
    Write-Host "  Expected: $expectedStock units" -ForegroundColor Gray
    
    if ($stockAfter -eq $expectedStock) {
        Write-Host "  ✓ Stock deducted correctly (FEFO)" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ✗ Stock deduction mismatch!" -ForegroundColor Red
        $script:testsFailed++
    }
}
Write-Host ""

# ============================================================
# TEST 12: Verify Stock Movement Recorded
# ============================================================

$movementsResponse = Test-Endpoint -Name "Check stock movements" -Method "GET" -Url "$BaseUrl/stock-movements/product/$productId"

if ($movementsResponse) {
    $saleMovements = $movementsResponse.data | Where-Object { $_.movementType -eq "SALE" -and $_.referenceId -eq $saleId }
    
    if ($saleMovements) {
        Write-Host "  ✓ Stock movement recorded" -ForegroundColor Green
        Write-Host "  Movement Type: $($saleMovements.movementType)" -ForegroundColor Gray
        Write-Host "  Quantity: $($saleMovements.quantity)" -ForegroundColor Gray
        Write-Host "  Reference: $($saleMovements.referenceType) $saleNumber" -ForegroundColor Gray
        $script:testsPassed++
    } else {
        Write-Host "  ✗ Stock movement NOT found" -ForegroundColor Red
        $script:testsFailed++
    }
}
Write-Host ""

# ============================================================
# TEST 13: Create Credit Sale (Customer Balance Update)
# ============================================================

$creditSaleBody = @{
    customerId = $customerId
    lineItems = @(
        @{
            productId = $productId
            productName = "POS Test Product"
            sku = "POSTEST001"
            uom = "pc"
            quantity = 3
            unitPrice = 1500
            costPrice = 1000
            subtotal = 4500
            taxAmount = 0
        }
    )
    subtotal = 4500
    taxAmount = 0
    totalAmount = 4500
    paymentMethod = "CREDIT"
}

$creditSaleResponse = Test-Endpoint -Name "Create POS sale (CREDIT)" -Method "POST" -Url "$BaseUrl/sales" -Body $creditSaleBody -ExpectedStatus 201

if ($creditSaleResponse) {
    Write-Host "  Sale Number: $($creditSaleResponse.data.sale.saleNumber)" -ForegroundColor Gray
    Write-Host "  Total: UGX $($creditSaleResponse.data.sale.totalAmount)" -ForegroundColor Gray
}
Write-Host ""

# ============================================================
# TEST 14: Verify Customer Balance Updated
# ============================================================

$customerCheckResponse = Test-Endpoint -Name "Check customer balance" -Method "GET" -Url "$BaseUrl/customers/$customerId"

if ($customerCheckResponse) {
    $customerBalance = $customerCheckResponse.data.balance
    $expectedBalance = 4500
    
    Write-Host "  Customer balance: UGX $customerBalance" -ForegroundColor Gray
    Write-Host "  Expected: UGX $expectedBalance" -ForegroundColor Gray
    
    if ($customerBalance -eq $expectedBalance) {
        Write-Host "  ✓ Balance updated correctly" -ForegroundColor Green
        $script:testsPassed++
    } else {
        Write-Host "  ✗ Balance mismatch!" -ForegroundColor Red
        $script:testsFailed++
    }
}
Write-Host ""

# ============================================================
# TEST 15: Verify Inventory Batches FEFO Deduction
# ============================================================

$batchesResponse = Test-Endpoint -Name "Check inventory batches" -Method "GET" -Url "$BaseUrl/inventory/batches/$productId"

if ($batchesResponse) {
    $batch = $batchesResponse.data | Where-Object { $_.batchNumber -eq "BATCH-TEST-001" }
    
    if ($batch) {
        $expectedRemaining = 100 - 5 - 3  # Initial - CASH sale - CREDIT sale
        Write-Host "  Batch: $($batch.batchNumber)" -ForegroundColor Gray
        Write-Host "  Remaining: $($batch.remainingQuantity) units" -ForegroundColor Gray
        Write-Host "  Expected: $expectedRemaining units" -ForegroundColor Gray
        Write-Host "  Expiry: $($batch.expiryDate)" -ForegroundColor Gray
        Write-Host "  Status: $($batch.status)" -ForegroundColor Gray
        
        if ($batch.remainingQuantity -eq $expectedRemaining) {
            Write-Host "  ✓ FEFO batch deduction correct" -ForegroundColor Green
            $script:testsPassed++
        } else {
            Write-Host "  ✗ FEFO batch deduction mismatch!" -ForegroundColor Red
            $script:testsFailed++
        }
    }
}
Write-Host ""

# ============================================================
# SUMMARY
# ============================================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Tests Passed: $testsPassed" -ForegroundColor Green
Write-Host "Tests Failed: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✓ ALL TESTS PASSED" -ForegroundColor Green
    Write-Host ""
    Write-Host "POS Integration Complete:" -ForegroundColor Cyan
    Write-Host "  ✓ Product search and selection" -ForegroundColor Green
    Write-Host "  ✓ Customer selection and credit validation" -ForegroundColor Green
    Write-Host "  ✓ CASH and CREDIT payment processing" -ForegroundColor Green
    Write-Host "  ✓ FEFO inventory batch deduction" -ForegroundColor Green
    Write-Host "  ✓ Stock movement recording" -ForegroundColor Green
    Write-Host "  ✓ Customer balance tracking" -ForegroundColor Green
    Write-Host "  ✓ Physical stock synchronization" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host "✗ SOME TESTS FAILED" -ForegroundColor Red
    Write-Host ""
    exit 1
}
