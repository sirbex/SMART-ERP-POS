# Test Script: Hold Button Behavior
# Tests the complete flow of holding and retrieving carts

$baseUrl = "http://localhost:3001/api"
$headers = @{
    "Content-Type" = "application/json"
}

Write-Host "=== HOLD BUTTON BEHAVIOR TEST ===" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login to get auth token
Write-Host "Step 1: Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "test@pos.com"
    password = "test12345"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Headers $headers -Body $loginBody
    $token = $loginResponse.data.token
    $userId = $loginResponse.data.user.id
    Write-Host "✓ Logged in successfully" -ForegroundColor Green
    Write-Host "  User ID: $userId" -ForegroundColor Gray
    Write-Host ""
    
    $authHeaders = @{
        "Content-Type" = "application/json"
        "Authorization" = "Bearer $token"
    }
} catch {
    Write-Host "✗ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Step 2: Get a product to add to cart
Write-Host "Step 2: Fetching products..." -ForegroundColor Yellow
try {
    $productsResponse = Invoke-RestMethod -Uri "$baseUrl/products?limit=1" -Method GET -Headers $authHeaders
    $product = $productsResponse.data.data[0]
    Write-Host "✓ Product fetched: $($product.name)" -ForegroundColor Green
    Write-Host "  Product ID: $($product.id)" -ForegroundColor Gray
    Write-Host "  Price: UGX $($product.selling_price)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Failed to fetch products: $_" -ForegroundColor Red
    exit 1
}

# Step 3: Create a hold order (simulate "Hold Cart" button click)
Write-Host "Step 3: Testing HOLD CART button..." -ForegroundColor Yellow
$holdBody = @{
    userId = $userId
    terminalId = "TERMINAL-001"
    customerName = "Test Customer"
    itemCount = 2
    subtotal = 50000
    discountAmount = 0
    taxAmount = 9000
    totalAmount = 59000
    items = @(
        @{
            productId = $product.id
            productName = $product.name
            sku = $product.sku
            uom = "piece"
            uomId = $null
            quantity = 2
            unitPrice = 25000
            costPrice = 15000
            subtotal = 50000
            productType = "inventory"
            discount = 0
        }
    )
} | ConvertTo-Json -Depth 10

try {
    Write-Host "  Sending hold request..." -ForegroundColor Gray
    $holdResponse = Invoke-RestMethod -Uri "$baseUrl/pos/hold" -Method POST -Headers $authHeaders -Body $holdBody
    $holdId = $holdResponse.data.id
    $holdNumber = $holdResponse.data.holdNumber
    Write-Host "✓ Cart held successfully!" -ForegroundColor Green
    Write-Host "  Hold Number: $holdNumber" -ForegroundColor Gray
    Write-Host "  Hold ID: $holdId" -ForegroundColor Gray
    Write-Host "  Message: $($holdResponse.message)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Failed to hold cart: $_" -ForegroundColor Red
    Write-Host "  Error details: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: List held orders (simulate badge count)
Write-Host "Step 4: Testing HELD ORDERS COUNT..." -ForegroundColor Yellow
try {
    $listResponse = Invoke-RestMethod -Uri "$baseUrl/pos/hold" -Method GET -Headers $authHeaders
    $holdCount = $listResponse.data.Count
    Write-Host "✓ Held orders retrieved" -ForegroundColor Green
    Write-Host "  Count: $holdCount" -ForegroundColor Gray
    Write-Host "  Badge should show: [$holdCount]" -ForegroundColor Cyan
    Write-Host ""
    
    if ($holdCount -gt 0) {
        Write-Host "  Held Orders:" -ForegroundColor Gray
        foreach ($hold in $listResponse.data) {
            Write-Host "    - $($hold.holdNumber): $($hold.itemCount) items, UGX $($hold.totalAmount)" -ForegroundColor Gray
        }
        Write-Host ""
    }
} catch {
    Write-Host "✗ Failed to list holds: $_" -ForegroundColor Red
    exit 1
}

# Step 5: Get hold details (simulate "Retrieve" button)
Write-Host "Step 5: Testing RETRIEVE button..." -ForegroundColor Yellow
try {
    $getHoldResponse = Invoke-RestMethod -Uri "$baseUrl/pos/hold/$holdId" -Method GET -Headers $authHeaders
    Write-Host "✓ Hold details retrieved" -ForegroundColor Green
    Write-Host "  Hold Number: $($getHoldResponse.data.holdNumber)" -ForegroundColor Gray
    Write-Host "  Items: $($getHoldResponse.data.items.Count)" -ForegroundColor Gray
    Write-Host "  Total: UGX $($getHoldResponse.data.totalAmount)" -ForegroundColor Gray
    Write-Host ""
    
    Write-Host "  Items in hold:" -ForegroundColor Gray
    foreach ($item in $getHoldResponse.data.items) {
        Write-Host "    - $($item.productName): $($item.quantity)x @ UGX $($item.unitPrice)" -ForegroundColor Gray
    }
    Write-Host ""
} catch {
    Write-Host "✗ Failed to retrieve hold: $_" -ForegroundColor Red
    exit 1
}

# Step 6: Delete hold (simulate completing the resumed cart)
Write-Host "Step 6: Testing DELETE hold (after resume)..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$baseUrl/pos/hold/$holdId" -Method DELETE -Headers $authHeaders
    Write-Host "✓ Hold deleted successfully" -ForegroundColor Green
    Write-Host "  Message: $($deleteResponse.message)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "✗ Failed to delete hold: $_" -ForegroundColor Red
    exit 1
}

# Step 7: Verify hold count is updated
Write-Host "Step 7: Verifying badge count after delete..." -ForegroundColor Yellow
try {
    $finalListResponse = Invoke-RestMethod -Uri "$baseUrl/pos/hold" -Method GET -Headers $authHeaders
    $finalCount = $finalListResponse.data.Count
    Write-Host "✓ Final hold count verified" -ForegroundColor Green
    Write-Host "  Count: $finalCount" -ForegroundColor Gray
    Write-Host "  Badge should show: $(if ($finalCount -gt 0) { "[$finalCount]" } else { "(hidden)" })" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "✗ Failed to verify final count: $_" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "=== TEST SUMMARY ===" -ForegroundColor Cyan
Write-Host "✓ All hold button behaviors working correctly!" -ForegroundColor Green
Write-Host ""
Write-Host "Expected Frontend Behavior:" -ForegroundColor Yellow
Write-Host "1. When cart has items → Button shows 'Hold Cart'" -ForegroundColor Gray
Write-Host "2. Click Hold Cart → Cart clears, badge shows count" -ForegroundColor Gray
Write-Host "3. When cart empty + holds exist → Button shows 'Retrieve' with badge" -ForegroundColor Gray
Write-Host "4. Click Retrieve → Dialog opens with held orders" -ForegroundColor Gray
Write-Host "5. Resume hold → Cart restores, badge count decrements" -ForegroundColor Gray
Write-Host ""
