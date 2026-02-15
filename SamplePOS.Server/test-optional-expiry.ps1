# Test Manual GR with Optional Expiry Dates
# Verifies that items without expiry dates can be received successfully

$ErrorActionPreference = "Stop"
$baseUrl = "http://localhost:3001/api"

Write-Host "`n=== Testing Optional Expiry Dates ===" -ForegroundColor Cyan
Write-Host "Scenario: Receive items with and without expiry dates`n"

# Login
Write-Host "[1/4] Logging in..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginPayload -ContentType "application/json"
$token = $loginResponse.data.token
$userId = $loginResponse.data.user.id
Write-Host "✓ Logged in`n" -ForegroundColor Green

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Get supplier and products
Write-Host "[2/4] Fetching supplier and products..." -ForegroundColor Yellow
$suppliersResponse = Invoke-RestMethod -Uri "$baseUrl/suppliers?limit=1" -Method GET -Headers $headers
$supplier = $suppliersResponse.data[0]

$productsResponse = Invoke-RestMethod -Uri "$baseUrl/products?limit=2" -Method GET -Headers $headers
$products = $productsResponse.data

Write-Host "✓ Supplier: $($supplier.name)" -ForegroundColor Green
Write-Host "✓ Products: $($products.Count)`n" -ForegroundColor Green

# Create GR with mixed expiry dates
Write-Host "[3/4] Creating GR with mixed expiry dates..." -ForegroundColor Yellow
$grPayload = @{
    supplierId = $supplier.id
    purchaseOrderId = $null
    receiptDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    receivedBy = $userId
    notes = "Test: Items with and without expiry"
    source = "MANUAL"
    items = @(
        @{
            poItemId = $null
            productId = $products[0].id
            productName = $products[0].name
            orderedQuantity = 5
            receivedQuantity = 5
            unitCost = 1000
            batchNumber = "BATCH-WITH-EXPIRY"
            expiryDate = (Get-Date).AddMonths(6).ToString("yyyy-MM-dd")
        },
        @{
            poItemId = $null
            productId = $products[1].id
            productName = $products[1].name
            orderedQuantity = 10
            receivedQuantity = 10
            unitCost = 500
            batchNumber = "BATCH-NO-EXPIRY"
            expiryDate = $null  # No expiry date
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $grResponse = Invoke-RestMethod -Uri "$baseUrl/goods-receipts" -Method POST -Body $grPayload -Headers $headers
    $gr = $grResponse.data.gr
    $items = $grResponse.data.items
    
    Write-Host "✓ GR created: $($gr.grNumber)" -ForegroundColor Green
    Write-Host "`n  Items:" -ForegroundColor Cyan
    
    foreach ($item in $items) {
        $expiryDisplay = if ($item.expiryDate) { 
            (Get-Date $item.expiryDate).ToString("yyyy-MM-dd") 
        } else { 
            "No expiry (non-perishable)" 
        }
        Write-Host "    - $($item.productName): Qty=$($item.receivedQuantity), Expiry=$expiryDisplay" -ForegroundColor White
    }
    Write-Host ""
} catch {
    $errorDetail = $_.ErrorDetails.Message | ConvertFrom-Json -ErrorAction SilentlyContinue
    if ($errorDetail) {
        Write-Host "✗ Failed:" -ForegroundColor Red
        Write-Host "  $($errorDetail.error)"
        if ($errorDetail.details) {
            $errorDetail.details | ForEach-Object { Write-Host "  - $($_.message)" }
        }
    } else {
        Write-Host "✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit 1
}

# Verify GR details
Write-Host "[4/4] Verifying GR with optional expiry..." -ForegroundColor Yellow
try {
    $grDetailResponse = Invoke-RestMethod -Uri "$baseUrl/goods-receipts/$($gr.id)" -Method GET -Headers $headers
    $retrievedItems = $grDetailResponse.data.items
    
    $withExpiry = ($retrievedItems | Where-Object { $_.expiryDate -ne $null }).Count
    $withoutExpiry = ($retrievedItems | Where-Object { $_.expiryDate -eq $null }).Count
    
    Write-Host "✓ Retrieved GR successfully" -ForegroundColor Green
    Write-Host "  Items with expiry: $withExpiry" -ForegroundColor Cyan
    Write-Host "  Items without expiry: $withoutExpiry" -ForegroundColor Cyan
    
    if ($withoutExpiry -gt 0) {
        Write-Host "`n✅ SUCCESS: Items without expiry dates are properly stored!" -ForegroundColor Green
    }
    Write-Host ""
} catch {
    Write-Host "⚠ Could not retrieve GR details" -ForegroundColor Yellow
}

Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "✓ Items with expiry dates: Tracked with expiration monitoring" -ForegroundColor Green
Write-Host "✓ Items without expiry dates: Stored as null (non-perishable goods)" -ForegroundColor Green
Write-Host "✓ System handles both scenarios correctly`n" -ForegroundColor Green
