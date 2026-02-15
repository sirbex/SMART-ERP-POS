# API Communication Test Suite
# Tests database connectivity and API endpoints

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  SamplePOS API Communication Test Suite  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$baseUrl = "http://localhost:3001"
$testsPassed = 0
$testsFailed = 0
$testResults = @()

# Function to test endpoint
function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = $null,
        [hashtable]$Headers = @{}
    )
    
    Write-Host "Testing: $Name..." -NoNewline
    
    try {
        $params = @{
            Uri = "$baseUrl$Endpoint"
            Method = $Method
            Headers = $Headers
            ContentType = 'application/json'
            ErrorAction = 'Stop'
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        
        if ($response.success -eq $true) {
            Write-Host " ✅ PASSED" -ForegroundColor Green
            $script:testsPassed++
            $script:testResults += [PSCustomObject]@{
                Test = $Name
                Status = "PASSED"
                Response = $response
            }
            return $response
        } else {
            Write-Host " ⚠️  UNEXPECTED RESPONSE" -ForegroundColor Yellow
            Write-Host "   Response: $($response | ConvertTo-Json -Depth 2)" -ForegroundColor Yellow
            $script:testsFailed++
            $script:testResults += [PSCustomObject]@{
                Test = $Name
                Status = "FAILED"
                Error = "Unexpected response structure"
            }
            return $null
        }
    } catch {
        Write-Host " ❌ FAILED" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        $script:testsFailed++
        $script:testResults += [PSCustomObject]@{
            Test = $Name
            Status = "FAILED"
            Error = $_.Exception.Message
        }
        return $null
    }
}

# Function to test database connection
function Test-DatabaseConnection {
    Write-Host ""
    Write-Host "=== Database Connection Test ===" -ForegroundColor Yellow
    
    $healthResult = Test-Endpoint -Name "Health Check" -Method "GET" -Endpoint "/health"
    
    if ($healthResult) {
        Write-Host "   Database: Connected ✅" -ForegroundColor Green
        Write-Host "   Timestamp: $($healthResult.timestamp)" -ForegroundColor Gray
        return $true
    } else {
        Write-Host "   Database: Connection Failed ❌" -ForegroundColor Red
        return $false
    }
}

# Function to register and login test user
function Get-TestAuthToken {
    Write-Host ""
    Write-Host "=== Authentication Test ===" -ForegroundColor Yellow
    
    # Try to login first
    $loginBody = @{
        email = "test@example.com"
        password = "Test123456"
    }
    
    $loginResult = Test-Endpoint -Name "Login Test User" -Method "POST" -Endpoint "/api/auth/login" -Body $loginBody
    
    if ($loginResult -and $loginResult.data.token) {
        Write-Host "   Token obtained: $($loginResult.data.token.Substring(0, 20))..." -ForegroundColor Gray
        return $loginResult.data.token
    }
    
    # If login fails, try to register
    Write-Host "   Login failed, attempting registration..." -ForegroundColor Yellow
    
    $registerBody = @{
        name = "Test User"
        email = "test@example.com"
        password = "Test123456"
        role = "ADMIN"
    }
    
    $registerResult = Test-Endpoint -Name "Register Test User" -Method "POST" -Endpoint "/api/auth/register" -Body $registerBody
    
    if ($registerResult -and $registerResult.data.token) {
        Write-Host "   Token obtained: $($registerResult.data.token.Substring(0, 20))..." -ForegroundColor Gray
        return $registerResult.data.token
    }
    
    return $null
}

# Test Products Module
function Test-ProductsModule {
    param([string]$Token)
    
    Write-Host ""
    Write-Host "=== Products Module Test ===" -ForegroundColor Yellow
    
    $headers = @{ Authorization = "Bearer $Token" }
    
    # List products
    $products = Test-Endpoint -Name "List Products" -Method "GET" -Endpoint "/api/products?page=1&limit=10" -Headers $headers
    
    # Create product
    $newProduct = @{
        sku = "TEST-$(Get-Random -Minimum 1000 -Maximum 9999)"
        name = "Test Product"
        description = "Test product description"
        category = "Test Category"
        costPrice = 100.00
        sellingPrice = 150.00
        reorderLevel = 10
        isActive = $true
    }
    
    $created = Test-Endpoint -Name "Create Product" -Method "POST" -Endpoint "/api/products" -Body $newProduct -Headers $headers
    
    if ($created -and $created.data.id) {
        $productId = $created.data.id
        Write-Host "   Product ID: $productId" -ForegroundColor Gray
        
        # Get product by ID
        Test-Endpoint -Name "Get Product by ID" -Method "GET" -Endpoint "/api/products/$productId" -Headers $headers | Out-Null
        
        return $productId
    }
    
    return $null
}

# Test Customers Module
function Test-CustomersModule {
    param([string]$Token)
    
    Write-Host ""
    Write-Host "=== Customers Module Test ===" -ForegroundColor Yellow
    
    $headers = @{ Authorization = "Bearer $Token" }
    
    # List customers
    Test-Endpoint -Name "List Customers" -Method "GET" -Endpoint "/api/customers?page=1&limit=10" -Headers $headers | Out-Null
    
    # Create customer
    $newCustomer = @{
        name = "Test Customer"
        email = "customer$(Get-Random -Minimum 1000 -Maximum 9999)@test.com"
        phone = "1234567890"
        creditLimit = 1000.00
    }
    
    $created = Test-Endpoint -Name "Create Customer" -Method "POST" -Endpoint "/api/customers" -Body $newCustomer -Headers $headers
    
    if ($created -and $created.data.id) {
        $customerId = $created.data.id
        Write-Host "   Customer ID: $customerId" -ForegroundColor Gray
        return $customerId
    }
    
    return $null
}

# Test Suppliers Module
function Test-SuppliersModule {
    param([string]$Token)
    
    Write-Host ""
    Write-Host "=== Suppliers Module Test ===" -ForegroundColor Yellow
    
    $headers = @{ Authorization = "Bearer $Token" }
    
    # List suppliers
    Test-Endpoint -Name "List Suppliers" -Method "GET" -Endpoint "/api/suppliers?page=1&limit=10" -Headers $headers | Out-Null
    
    # Create supplier
    $newSupplier = @{
        name = "Test Supplier $(Get-Random -Minimum 1000 -Maximum 9999)"
        contactPerson = "John Doe"
        email = "supplier@test.com"
        phone = "9876543210"
        paymentTerms = "NET30"
    }
    
    $created = Test-Endpoint -Name "Create Supplier" -Method "POST" -Endpoint "/api/suppliers" -Body $newSupplier -Headers $headers
    
    if ($created -and $created.data.id) {
        $supplierId = $created.data.id
        Write-Host "   Supplier ID: $supplierId" -ForegroundColor Gray
        return $supplierId
    }
    
    return $null
}

# Test Inventory Module
function Test-InventoryModule {
    param([string]$Token, [string]$ProductId)
    
    Write-Host ""
    Write-Host "=== Inventory Module Test ===" -ForegroundColor Yellow
    
    $headers = @{ Authorization = "Bearer $Token" }
    
    # Get stock levels
    Test-Endpoint -Name "Get Stock Levels" -Method "GET" -Endpoint "/api/inventory/stock-levels" -Headers $headers | Out-Null
    
    if ($ProductId) {
        # Get stock level by product
        Test-Endpoint -Name "Get Stock Level by Product" -Method "GET" -Endpoint "/api/inventory/stock-levels/$ProductId" -Headers $headers | Out-Null
    }
    
    # Get batches expiring soon
    Test-Endpoint -Name "Get Expiring Batches" -Method "GET" -Endpoint "/api/inventory/expiring-soon?days=30" -Headers $headers | Out-Null
}

# Test Stock Movements Module
function Test-StockMovementsModule {
    param([string]$Token)
    
    Write-Host ""
    Write-Host "=== Stock Movements Module Test ===" -ForegroundColor Yellow
    
    $headers = @{ Authorization = "Bearer $Token" }
    
    # List stock movements
    Test-Endpoint -Name "List Stock Movements" -Method "GET" -Endpoint "/api/stock-movements?page=1&limit=10" -Headers $headers | Out-Null
}

# Main execution
Write-Host "Starting API tests..." -ForegroundColor Cyan
Write-Host ""

# Test database connection
$dbConnected = Test-DatabaseConnection

if (-not $dbConnected) {
    Write-Host ""
    Write-Host "❌ Database connection failed. Please ensure:" -ForegroundColor Red
    Write-Host "   1. PostgreSQL is running" -ForegroundColor Yellow
    Write-Host "   2. Database 'pos_system' exists" -ForegroundColor Yellow
    Write-Host "   3. Connection string in .env is correct" -ForegroundColor Yellow
    Write-Host "   4. Run init-db.ps1 to initialize database" -ForegroundColor Yellow
    exit 1
}

# Get authentication token
$token = Get-TestAuthToken

if (-not $token) {
    Write-Host ""
    Write-Host "❌ Authentication failed. Cannot proceed with API tests." -ForegroundColor Red
    exit 1
}

# Run module tests
$productId = Test-ProductsModule -Token $token
$customerId = Test-CustomersModule -Token $token
$supplierId = Test-SuppliersModule -Token $token
Test-InventoryModule -Token $token -ProductId $productId
Test-StockMovementsModule -Token $token

# Print summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "              TEST SUMMARY                  " -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Total Tests: $($testsPassed + $testsFailed)" -ForegroundColor White
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor Red
Write-Host ""

if ($testsFailed -eq 0) {
    Write-Host "✅ All tests passed! API is ready for frontend integration." -ForegroundColor Green
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Cyan
    Write-Host "1. Start the server: cd SamplePOS.Server && npm run dev" -ForegroundColor Yellow
    Write-Host "2. Start the frontend: cd samplepos.client && npm run dev" -ForegroundColor Yellow
    Write-Host "3. Access application at: http://localhost:5173" -ForegroundColor Yellow
} else {
    Write-Host "⚠️  Some tests failed. Please review the errors above." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Failed Tests:" -ForegroundColor Red
    $testResults | Where-Object { $_.Status -eq "FAILED" } | ForEach-Object {
        Write-Host "   - $($_.Test): $($_.Error)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "API Endpoint: http://localhost:3001" -ForegroundColor Cyan
Write-Host "Health Check: http://localhost:3001/health" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
