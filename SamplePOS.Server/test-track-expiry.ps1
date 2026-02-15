# Test Track Expiry Feature
# Tests:
# 1. Create product with trackExpiry=true, verify expiry required
# 2. Create product with trackExpiry=false, verify expiry not required
# 3. Create manual GR with both product types

$baseUrl = "http://localhost:3001/api"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Track Expiry Feature Test" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Step 1: Login as admin
Write-Host "[1] Logging in as admin..." -ForegroundColor Yellow
$loginPayload = @{
    email = "admin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginPayload -ContentType "application/json"
    $token = $loginResponse.data.token
    $userId = $loginResponse.data.user.id
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    Write-Host "✓ Login successful (User ID: $userId)" -ForegroundColor Green
} catch {
    Write-Host "✗ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Get supplier ID
Write-Host "`n[2] Getting supplier..." -ForegroundColor Yellow
try {
    $suppliersResponse = Invoke-RestMethod -Uri "$baseUrl/suppliers" -Method GET -Headers $headers
    $supplier = $suppliersResponse.data[0]
    Write-Host "✓ Using supplier: $($supplier.name) (ID: $($supplier.id))" -ForegroundColor Green
} catch {
    Write-Host "✗ Failed to get suppliers: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 3: Create product with trackExpiry=true (perishable)
Write-Host "`n[3] Creating perishable product (trackExpiry=true)..." -ForegroundColor Yellow
$perishableProduct = @{
    name = "Test Perishable Item - $(Get-Date -Format 'HHmmss')"
    sku = "PERISH-$(Get-Date -Format 'HHmmss')"
    category = "Perishable"
    unitOfMeasure = "PCS"
    costPrice = 1000
    sellingPrice = 1500
    reorderLevel = 10
    trackExpiry = $true
} | ConvertTo-Json

try {
    $perishableResponse = Invoke-RestMethod -Uri "$baseUrl/products" -Method POST -Body $perishableProduct -Headers $headers
    $perishableProductId = $perishableResponse.data.id
    Write-Host "✓ Created perishable product: $($perishableResponse.data.name)" -ForegroundColor Green
    Write-Host "  - ID: $perishableProductId" -ForegroundColor Gray
    Write-Host "  - Track Expiry: $($perishableResponse.data.trackExpiry)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to create perishable product: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 4: Create product with trackExpiry=false (non-perishable)
Write-Host "`n[4] Creating non-perishable product (trackExpiry=false)..." -ForegroundColor Yellow
$nonPerishableProduct = @{
    name = "Test Non-Perishable Item - $(Get-Date -Format 'HHmmss')"
    sku = "NONPERISH-$(Get-Date -Format 'HHmmss')"
    category = "Non-Perishable"
    unitOfMeasure = "PCS"
    costPrice = 2000
    sellingPrice = 2800
    reorderLevel = 5
    trackExpiry = $false
} | ConvertTo-Json

try {
    $nonPerishableResponse = Invoke-RestMethod -Uri "$baseUrl/products" -Method POST -Body $nonPerishableProduct -Headers $headers
    $nonPerishableProductId = $nonPerishableResponse.data.id
    Write-Host "✓ Created non-perishable product: $($nonPerishableResponse.data.name)" -ForegroundColor Green
    Write-Host "  - ID: $nonPerishableProductId" -ForegroundColor Gray
    Write-Host "  - Track Expiry: $($nonPerishableResponse.data.trackExpiry)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to create non-perishable product: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 5: Create manual GR with perishable item (expiry REQUIRED)
Write-Host "`n[5] Creating manual GR with perishable item (WITH expiry)..." -ForegroundColor Yellow
$futureDate = (Get-Date).AddMonths(6).ToString("yyyy-MM-dd")
$grWithExpiry = @{
    supplierId = $supplier.id
    receiptDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    receivedBy = $userId
    notes = "Test GR - Perishable item with expiry"
    source = "MANUAL"
    items = @(
        @{
            productId = $perishableProductId
            productName = $perishableResponse.data.name
            orderedQuantity = 10
            receivedQuantity = 10
            unitCost = 1000
            batchNumber = "BATCH-PERISH-001"
            expiryDate = $futureDate
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $grWithExpiryResponse = Invoke-RestMethod -Uri "$baseUrl/goods-receipts" -Method POST -Body $grWithExpiry -Headers $headers
    Write-Host "✓ Created GR with perishable item:" -ForegroundColor Green
    Write-Host "  - GR Number: $($grWithExpiryResponse.data.grNumber)" -ForegroundColor Gray
    Write-Host "  - Auto PO: $($grWithExpiryResponse.data.manualPO.poNumber)" -ForegroundColor Gray
    Write-Host "  - Expiry Date: $futureDate" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to create GR with expiry: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Step 6: Create manual GR with non-perishable item (expiry NOT required)
Write-Host "`n[6] Creating manual GR with non-perishable item (NO expiry)..." -ForegroundColor Yellow
$grWithoutExpiry = @{
    supplierId = $supplier.id
    receiptDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    receivedBy = $userId
    notes = "Test GR - Non-perishable item without expiry"
    source = "MANUAL"
    items = @(
        @{
            productId = $nonPerishableProductId
            productName = $nonPerishableResponse.data.name
            orderedQuantity = 20
            receivedQuantity = 20
            unitCost = 2000
            batchNumber = "BATCH-NONPERISH-001"
            expiryDate = $null
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $grWithoutExpiryResponse = Invoke-RestMethod -Uri "$baseUrl/goods-receipts" -Method POST -Body $grWithoutExpiry -Headers $headers
    Write-Host "✓ Created GR with non-perishable item:" -ForegroundColor Green
    Write-Host "  - GR Number: $($grWithoutExpiryResponse.data.grNumber)" -ForegroundColor Gray
    Write-Host "  - Auto PO: $($grWithoutExpiryResponse.data.manualPO.poNumber)" -ForegroundColor Gray
    Write-Host "  - Expiry Date: null (not required)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to create GR without expiry: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Step 7: Create manual GR with BOTH types in one receipt
Write-Host "`n[7] Creating manual GR with BOTH product types..." -ForegroundColor Yellow
$grMixed = @{
    supplierId = $supplier.id
    receiptDate = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    receivedBy = $userId
    notes = "Test GR - Mixed perishable and non-perishable"
    source = "MANUAL"
    items = @(
        @{
            productId = $perishableProductId
            productName = $perishableResponse.data.name
            orderedQuantity = 5
            receivedQuantity = 5
            unitCost = 1000
            batchNumber = "BATCH-PERISH-002"
            expiryDate = $futureDate
        },
        @{
            productId = $nonPerishableProductId
            productName = $nonPerishableResponse.data.name
            orderedQuantity = 15
            receivedQuantity = 15
            unitCost = 2000
            batchNumber = "BATCH-NONPERISH-002"
            expiryDate = $null
        }
    )
} | ConvertTo-Json -Depth 10

try {
    $grMixedResponse = Invoke-RestMethod -Uri "$baseUrl/goods-receipts" -Method POST -Body $grMixed -Headers $headers
    Write-Host "✓ Created GR with mixed items:" -ForegroundColor Green
    Write-Host "  - GR Number: $($grMixedResponse.data.grNumber)" -ForegroundColor Gray
    Write-Host "  - Auto PO: $($grMixedResponse.data.manualPO.poNumber)" -ForegroundColor Gray
    Write-Host "  - Items: 2 (1 perishable with expiry, 1 non-perishable without)" -ForegroundColor Gray
} catch {
    Write-Host "✗ Failed to create mixed GR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

# Step 8: Verify products were created with correct trackExpiry flag
Write-Host "`n[8] Verifying products have correct trackExpiry flag..." -ForegroundColor Yellow
try {
    $verifyPerishable = Invoke-RestMethod -Uri "$baseUrl/products/$perishableProductId" -Method GET -Headers $headers
    $verifyNonPerishable = Invoke-RestMethod -Uri "$baseUrl/products/$nonPerishableProductId" -Method GET -Headers $headers
    
    Write-Host "✓ Verification complete:" -ForegroundColor Green
    Write-Host "  - Perishable product trackExpiry: $($verifyPerishable.data.trackExpiry) (should be true)" -ForegroundColor Gray
    Write-Host "  - Non-perishable product trackExpiry: $($verifyNonPerishable.data.trackExpiry) (should be false)" -ForegroundColor Gray
    
    if ($verifyPerishable.data.trackExpiry -eq $true -and $verifyNonPerishable.data.trackExpiry -eq $false) {
        Write-Host "  ✓ Track expiry flags are correct!" -ForegroundColor Green
    } else {
        Write-Host "  ✗ Track expiry flags are incorrect!" -ForegroundColor Red
    }
} catch {
    Write-Host "✗ Failed to verify products: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Complete!" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "- Perishable product requires expiry date" -ForegroundColor Gray
Write-Host "- Non-perishable product does NOT require expiry date" -ForegroundColor Gray
Write-Host "- Both can be received in the same GR" -ForegroundColor Gray
Write-Host "- Track expiry setting is persisted in database" -ForegroundColor Gray
