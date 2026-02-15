# Test Hold/Resume Integration
# Tests database, backend API, and verifies all components are working

Write-Host "`n🧪 HOLD/RESUME INTEGRATION TEST`n" -ForegroundColor Cyan
Write-Host "=" * 60

# Test 1: Check database tables exist
Write-Host "`n✓ Test 1: Database Tables" -ForegroundColor Yellow
$env:PGPASSWORD = "password"
$tables = psql -U postgres -d pos_system -t -c "SELECT tablename FROM pg_tables WHERE tablename IN ('pos_held_orders', 'pos_held_order_items', 'products') ORDER BY tablename;" 2>&1

if ($tables -match "pos_held_orders" -and $tables -match "pos_held_order_items" -and $tables -match "products") {
    Write-Host "  ✅ All required tables exist" -ForegroundColor Green
    Write-Host "    - products" -ForegroundColor Gray
    Write-Host "    - pos_held_orders" -ForegroundColor Gray
    Write-Host "    - pos_held_order_items" -ForegroundColor Gray
} else {
    Write-Host "  ❌ Missing tables!" -ForegroundColor Red
    Write-Host $tables
    exit 1
}

# Test 2: Check product_type column exists
Write-Host "`n✓ Test 2: Product Type Column" -ForegroundColor Yellow
$productTypeCol = psql -U postgres -d pos_system -t -c "SELECT column_name FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'product_type';" 2>&1

if ($productTypeCol -match "product_type") {
    Write-Host "  ✅ product_type column exists in products table" -ForegroundColor Green
} else {
    Write-Host "  ❌ product_type column missing!" -ForegroundColor Red
    exit 1
}

# Test 3: Check backend server is running
Write-Host "`n✓ Test 3: Backend Server Health" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3001/health" -UseBasicParsing
    if ($health.success -eq $true) {
        Write-Host "  ✅ Backend server is healthy" -ForegroundColor Green
        Write-Host "    Status: $($health.status)" -ForegroundColor Gray
        Write-Host "    Time: $($health.timestamp)" -ForegroundColor Gray
    } else {
        Write-Host "  ❌ Server unhealthy" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "  ❌ Cannot connect to server at http://localhost:3001" -ForegroundColor Red
    Write-Host "    Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test 4: Test hold endpoint (without auth - should fail gracefully)
Write-Host "`n✓ Test 4: Hold API Endpoint Registration" -ForegroundColor Yellow
try {
    $holdResponse = Invoke-WebRequest -Uri "http://localhost:3001/api/pos/hold" -Method GET -UseBasicParsing -ErrorAction SilentlyContinue 2>&1
    
    # Check if we get a 401 (unauthorized) or 200 (needs auth)
    # If we get 404, the route isn't registered
    if ($holdResponse.StatusCode -eq 404) {
        Write-Host "  ❌ Hold endpoint NOT registered (404)" -ForegroundColor Red
        exit 1
    } elseif ($holdResponse.StatusCode -eq 401 -or $holdResponse.StatusCode -eq 403) {
        Write-Host "  ✅ Hold endpoint registered (requires authentication)" -ForegroundColor Green
    } elseif ($holdResponse.StatusCode -eq 200) {
        Write-Host "  ✅ Hold endpoint registered and accessible" -ForegroundColor Green
    } else {
        Write-Host "  ⚠️  Unexpected status: $($holdResponse.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    # PowerShell throws on non-2xx status codes, so check the response
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 401 -or $statusCode -eq 403) {
        Write-Host "  ✅ Hold endpoint registered (requires authentication)" -ForegroundColor Green
        Write-Host "    Status: $statusCode (Unauthorized - expected)" -ForegroundColor Gray
    } elseif ($statusCode -eq 404) {
        Write-Host "  ❌ Hold endpoint NOT registered (404)" -ForegroundColor Red
        Write-Host "    This means the route is missing in server.ts" -ForegroundColor Red
        exit 1
    } else {
        Write-Host "  ⚠️  Unexpected error: $statusCode" -ForegroundColor Yellow
    }
}

# Test 5: Check frontend files exist
Write-Host "`n✓ Test 5: Frontend Components" -ForegroundColor Yellow
$componentsPath = "c:\Users\Chase\source\repos\SamplePOS\samplepos.client\src\components\pos"
$requiredComponents = @(
    "HoldCartDialog.tsx",
    "ResumeHoldDialog.tsx",
    "ServiceBadge.tsx",
    "ServiceInfoBanner.tsx"
)

$allExist = $true
foreach ($component in $requiredComponents) {
    $path = Join-Path $componentsPath $component
    if (Test-Path $path) {
        Write-Host "  ✅ $component" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $component NOT FOUND" -ForegroundColor Red
        $allExist = $false
    }
}

if (-not $allExist) {
    Write-Host "`n  ❌ Some components are missing!" -ForegroundColor Red
    exit 1
}

# Test 6: Check POSPage integration
Write-Host "`n✓ Test 6: POSPage Integration" -ForegroundColor Yellow
$posPagePath = "c:\Users\Chase\source\repos\SamplePOS\samplepos.client\src\pages\pos\POSPage.tsx"
$posPageContent = Get-Content $posPagePath -Raw

$checks = @{
    "HoldCartDialog import" = $posPageContent -match "import.*HoldCartDialog"
    "ResumeHoldDialog import" = $posPageContent -match "import.*ResumeHoldDialog"
    "ServiceBadge import" = $posPageContent -match "import.*ServiceBadge"
    "ServiceInfoBanner import" = $posPageContent -match "import.*ServiceInfoBanner"
    "showHoldDialog state" = $posPageContent -match "showHoldDialog"
    "showResumeDialog state" = $posPageContent -match "showResumeDialog"
    "handleHoldCart handler" = $posPageContent -match "handleHoldCart"
    "handleResumeHold handler" = $posPageContent -match "handleResumeHold"
}

$allPassed = $true
foreach ($check in $checks.GetEnumerator()) {
    if ($check.Value) {
        Write-Host "  ✅ $($check.Key)" -ForegroundColor Green
    } else {
        Write-Host "  ❌ $($check.Key) MISSING" -ForegroundColor Red
        $allPassed = $false
    }
}

if (-not $allPassed) {
    Write-Host "`n  ❌ POSPage integration incomplete!" -ForegroundColor Red
    exit 1
}

# Summary
Write-Host "`n" + ("=" * 60)
Write-Host "🎉 ALL TESTS PASSED!" -ForegroundColor Green
Write-Host "`n✅ Integration Complete:" -ForegroundColor Cyan
Write-Host "  • Database migrations applied" -ForegroundColor Gray
Write-Host "  • Backend routes registered" -ForegroundColor Gray
Write-Host "  • Frontend components created" -ForegroundColor Gray
Write-Host "  • POSPage integrated" -ForegroundColor Gray

Write-Host "`n📝 Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Open POS: http://localhost:5173/pos" -ForegroundColor White
Write-Host "  2. Add items to cart" -ForegroundColor White
Write-Host "  3. Click 'Put on Hold' button" -ForegroundColor White
Write-Host "  4. Click 'Resume Hold' button to restore cart" -ForegroundColor White
Write-Host "  5. Create a service product (product_type = 'service')" -ForegroundColor White
Write-Host "  6. Add service item to cart - see SERVICE badge" -ForegroundColor White

Write-Host "`n🔗 Useful Links:" -ForegroundColor Yellow
Write-Host "  • Documentation: docs/POS_HOLD_AND_SERVICE.md" -ForegroundColor White
Write-Host "  • Verification: IMPLEMENTATION_VERIFICATION_REPORT.md" -ForegroundColor White
Write-Host "  • Guide: HOW_TO_ENABLE_NEW_FEATURES.md" -ForegroundColor White

Write-Host ""
