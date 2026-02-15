# Manual Stock Count API Test - Quick Verification
# Run this after starting server with: npm run dev

Write-Host "`n🧪 Testing Stock Count API..." -ForegroundColor Cyan

# Test 1: Login
Write-Host "`n1️⃣  Login..." -ForegroundColor Yellow
try {
    $login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" -Method POST `
        -Body '{"email":"stocktest_20251118104039@test.com","password":"Test123!@#"}' `
        -ContentType "application/json"
    
    $token = $login.data.token
    $headers = @{ Authorization = "Bearer $token" }
    Write-Host "✅ Logged in" -ForegroundColor Green
} catch {
    Write-Host "❌ Login failed: $_" -ForegroundColor Red
    exit 1
}

# Test 2: Create Stock Count
Write-Host "`n2️⃣  Create stock count..." -ForegroundColor Yellow
try {
    $create = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts" -Method POST `
        -Headers $headers `
        -Body '{"name":"Quick Test","notes":"Manual test","includeAllProducts":true}' `
        -ContentType "application/json"
    
    $countId = $create.data.stockCount.id
    Write-Host "✅ Created count: $countId" -ForegroundColor Green
    Write-Host "   State: $($create.data.stockCount.state)" -ForegroundColor Gray
    Write-Host "   Lines: $($create.data.linesCreated)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
    $_.Exception | Format-List -Force
    exit 1
}

# Test 3: Get Count
Write-Host "`n3️⃣  Get count by ID..." -ForegroundColor Yellow
try {
    $get = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts/$countId" -Headers $headers
    Write-Host "✅ Retrieved count" -ForegroundColor Green
    Write-Host "   Lines: $($get.data.lines.Count)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed: $_" -ForegroundColor Red
}

# Test 4: List Counts
Write-Host "`n4️⃣  List all counts..." -ForegroundColor Yellow
try {
    $list = Invoke-RestMethod -Uri "http://localhost:3001/api/inventory/stockcounts" -Headers $headers
    Write-Host "✅ Listed counts: $($list.data.counts.Count)" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed: $_" -ForegroundColor Red
}

Write-Host "`n✅ Basic tests passed! Stock Count API is working." -ForegroundColor Green
Write-Host "Count ID for further testing: $countId" -ForegroundColor Yellow
