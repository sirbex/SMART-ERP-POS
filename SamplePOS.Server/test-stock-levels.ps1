# Test script for GET /api/inventory/stock-levels endpoint

$baseUrl = "http://localhost:3001/api"

Write-Host "`n=== Testing Inventory Stock Levels Endpoint ===" -ForegroundColor Cyan

# Step 1: Login to get JWT token
Write-Host "`n[1] Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.data.token
    Write-Host "   ✅ Login successful!" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
} catch {
    Write-Host "   ❌ Login failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Call GET /api/inventory/stock-levels with Authorization header
Write-Host "`n[2] Fetching stock levels..." -ForegroundColor Yellow
try {
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    $stockLevelsResponse = Invoke-RestMethod -Uri "$baseUrl/inventory/stock-levels" -Method GET -Headers $headers
    
    Write-Host "   ✅ Stock levels retrieved successfully!" -ForegroundColor Green
    Write-Host "`n   Response:" -ForegroundColor Cyan
    Write-Host ($stockLevelsResponse | ConvertTo-Json -Depth 5) -ForegroundColor White
    
    # Validate response structure
    Write-Host "`n[3] Validating response structure..." -ForegroundColor Yellow
    
    if ($stockLevelsResponse.success -ne $true) {
        Write-Host "   ❌ Response missing 'success: true'" -ForegroundColor Red
    } else {
        Write-Host "   ✅ Response has 'success: true'" -ForegroundColor Green
    }
    
    if ($null -eq $stockLevelsResponse.data) {
        Write-Host "   ❌ Response missing 'data' field" -ForegroundColor Red
    } else {
        Write-Host "   ✅ Response has 'data' array" -ForegroundColor Green
        Write-Host "      Items count: $($stockLevelsResponse.data.Count)" -ForegroundColor Cyan
        
        if ($stockLevelsResponse.data.Count -gt 0) {
            $firstItem = $stockLevelsResponse.data[0]
            Write-Host "`n   First item fields:" -ForegroundColor Cyan
            Write-Host "      - productId: $($firstItem.productId)" -ForegroundColor Gray
            Write-Host "      - productName: $($firstItem.productName)" -ForegroundColor Gray
            Write-Host "      - totalQuantity: $($firstItem.totalQuantity)" -ForegroundColor Gray
            Write-Host "      - reorderLevel: $($firstItem.reorderLevel)" -ForegroundColor Gray
            Write-Host "      - needsReorder: $($firstItem.needsReorder)" -ForegroundColor Gray
        }
    }
    
    Write-Host "`n=== Test Complete ===" -ForegroundColor Cyan
    
} catch {
    Write-Host "   ❌ Request failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}
