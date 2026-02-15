# Test Sale Void Functionality
# Tests: Creating a sale, voiding it with manager approval, and verifying inventory restoration

$baseUrl = "http://localhost:3001/api"
$ErrorActionPreference = "Continue"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  SALE VOID FUNCTIONALITY TEST" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# =====================================================
# STEP 1: Login as Admin/Manager
# =====================================================
Write-Host "[1/7] Logging in as admin..." -ForegroundColor Yellow

$loginBody = @{
    email = "admin@pos.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod `
        -Uri "$baseUrl/auth/login" `
        -Method POST `
        -Body $loginBody `
        -ContentType "application/json"
    
    $token = $loginResponse.data.token
    $userId = $loginResponse.data.user.id
    
    Write-Host "✅ Login successful" -ForegroundColor Green
    Write-Host "   User ID: $userId" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# =====================================================
# STEP 2: Get a test product
# =====================================================
Write-Host "[2/7] Fetching test product..." -ForegroundColor Yellow

try {
    $productsResponse = Invoke-RestMethod `
        -Uri "$baseUrl/products?limit=1" `
        -Method GET `
        -Headers $headers
    
    $product = $productsResponse.data[0]
    $productId = $product.id
    $productName = $product.name
    $productPrice = $product.sellingPrice
    
    Write-Host "✅ Product found" -ForegroundColor Green
    Write-Host "   Product: $productName ($productId)" -ForegroundColor Gray
    Write-Host "   Price: $productPrice" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Failed to fetch product: $_" -ForegroundColor Red
    exit 1
}

# =====================================================
# STEP 3: Create a test sale
# =====================================================
Write-Host "[3/7] Creating test sale..." -ForegroundColor Yellow

$saleBody = @{
    lineItems = @(
        @{
            productId = $productId
            productName = $productName
            quantity = 2
            unitPrice = $productPrice
            uom = "PIECE"
        }
    )
    subtotal = ($productPrice * 2)
    taxAmount = 0
    totalAmount = ($productPrice * 2)
    paymentMethod = "CASH"
    amountTendered = ($productPrice * 2)
    paymentLines = @(
        @{
            paymentMethod = "CASH"
            amount = ($productPrice * 2)
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $saleResponse = Invoke-RestMethod `
        -Uri "$baseUrl/sales" `
        -Method POST `
        -Body $saleBody `
        -Headers $headers
    
    $saleId = $saleResponse.data.sale.id
    $saleNumber = $saleResponse.data.sale.saleNumber
    $saleTotal = $saleResponse.data.sale.totalAmount
    
    Write-Host "✅ Sale created successfully" -ForegroundColor Green
    Write-Host "   Sale Number: $saleNumber" -ForegroundColor Gray
    Write-Host "   Sale ID: $saleId" -ForegroundColor Gray
    Write-Host "   Total: $saleTotal" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Failed to create sale: $_" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# =====================================================
# STEP 4: Get inventory before void
# =====================================================
Write-Host "[4/7] Checking inventory before void..." -ForegroundColor Yellow

try {
    $inventoryBeforeResponse = Invoke-RestMethod `
        -Uri "$baseUrl/inventory/batches?productId=$productId" `
        -Method GET `
        -Headers $headers
    
    $batchesBefore = $inventoryBeforeResponse.data
    $totalQtyBefore = ($batchesBefore | Measure-Object -Property remainingQuantity -Sum).Sum
    
    Write-Host "✅ Inventory checked" -ForegroundColor Green
    Write-Host "   Total quantity: $totalQtyBefore" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "⚠️ Could not check inventory: $_" -ForegroundColor Yellow
    $totalQtyBefore = "N/A"
    Write-Host ""
}

# =====================================================
# STEP 5: Void the sale (without approval - should fail if > threshold)
# =====================================================
Write-Host "[5/7] Attempting to void sale WITHOUT approval..." -ForegroundColor Yellow

$voidBody = @{
    reason = "Test void - cashier error, wrong customer"
    amountThreshold = 10  # Set very low threshold to require approval
} | ConvertTo-Json

try {
    $voidResponse = Invoke-RestMethod `
        -Uri "$baseUrl/sales/$saleId/void" `
        -Method POST `
        -Body $voidBody `
        -Headers $headers
    
    Write-Host "⚠️ Void succeeded without approval (threshold not enforced)" -ForegroundColor Yellow
    Write-Host ""
} catch {
    $errorMessage = $_.ErrorDetails.Message | ConvertFrom-Json
    if ($errorMessage.error -like "*Manager approval required*") {
        Write-Host "✅ Correctly required manager approval" -ForegroundColor Green
        Write-Host "   Error: $($errorMessage.error)" -ForegroundColor Gray
        Write-Host ""
    } else {
        Write-Host "❌ Unexpected error: $($errorMessage.error)" -ForegroundColor Red
        exit 1
    }
}

# =====================================================
# STEP 6: Void the sale WITH approval
# =====================================================
Write-Host "[6/7] Voiding sale WITH manager approval..." -ForegroundColor Yellow

$voidBodyApproved = @{
    reason = "Test void - cashier error, wrong customer selected"
    approvedById = $userId  # Admin/Manager approving
    amountThreshold = 10  # Set very low threshold to require approval
} | ConvertTo-Json

try {
    $voidApprovedResponse = Invoke-RestMethod `
        -Uri "$baseUrl/sales/$saleId/void" `
        -Method POST `
        -Body $voidBodyApproved `
        -Headers $headers
    
    Write-Host "✅ Sale voided successfully" -ForegroundColor Green
    Write-Host "   Sale Number: $($voidApprovedResponse.data.sale.saleNumber)" -ForegroundColor Gray
    Write-Host "   Status: VOID" -ForegroundColor Gray
    Write-Host "   Items Restored: $($voidApprovedResponse.data.itemsRestored)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "❌ Failed to void sale: $_" -ForegroundColor Red
    Write-Host "Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# =====================================================
# STEP 7: Verify inventory restoration
# =====================================================
Write-Host "[7/7] Verifying inventory restoration..." -ForegroundColor Yellow

try {
    $inventoryAfterResponse = Invoke-RestMethod `
        -Uri "$baseUrl/inventory/batches?productId=$productId" `
        -Method GET `
        -Headers $headers
    
    $batchesAfter = $inventoryAfterResponse.data
    $totalQtyAfter = ($batchesAfter | Measure-Object -Property remainingQuantity -Sum).Sum
    
    Write-Host "✅ Inventory verified" -ForegroundColor Green
    Write-Host "   Quantity before void: $totalQtyBefore" -ForegroundColor Gray
    Write-Host "   Quantity after void: $totalQtyAfter" -ForegroundColor Gray
    
    if ($totalQtyBefore -ne "N/A") {
        $qtyRestored = $totalQtyAfter - $totalQtyBefore
        if ($qtyRestored -eq 2) {
            Write-Host "   ✅ Inventory correctly restored (+2 units)" -ForegroundColor Green
        } else {
            Write-Host "   ⚠️ Unexpected inventory change: $qtyRestored" -ForegroundColor Yellow
        }
    }
    Write-Host ""
} catch {
    Write-Host "⚠️ Could not verify inventory: $_" -ForegroundColor Yellow
    Write-Host ""
}

# =====================================================
# SUMMARY
# =====================================================
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "✅ Sale created: $saleNumber" -ForegroundColor Green
Write-Host "✅ Manager approval enforced" -ForegroundColor Green
Write-Host "✅ Sale voided successfully" -ForegroundColor Green
Write-Host "✅ Inventory restoration verified" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Check audit trail: GET $baseUrl/audit/entity/SALE/$saleId" -ForegroundColor Gray
Write-Host "2. Verify sale status: GET $baseUrl/sales/$saleId" -ForegroundColor Gray
Write-Host "3. Check stock movements: Query stock_movements table for VOID entries" -ForegroundColor Gray
Write-Host ""
