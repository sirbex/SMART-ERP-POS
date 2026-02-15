# Role-Based Access Control (RBAC) Testing Script
# Tests the efficiency and accuracy of user role permissions

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  RBAC System Verification Script" -ForegroundColor Cyan
Write-Host "  Testing Efficiency & Accuracy" -ForegroundColor Cyan
Write-Host "===============================================`n" -ForegroundColor Cyan

$baseUrl = "http://localhost:3001"
$passed = 0
$failed = 0

# Test user credentials
$users = @{
    ADMIN = @{ email = "admin@samplepos.com"; password = "admin123" }
    MANAGER = @{ email = "manager@samplepos.com"; password = "manager123" }
    CASHIER = @{ email = "cashier@samplepos.com"; password = "cashier123" }
    STAFF = @{ email = "staff@samplepos.com"; password = "staff123" }
}

# Login and get token
function Get-AuthToken {
    param($role)
    
    $creds = $users[$role]
    $body = @{
        email = $creds.email
        password = $creds.password
    } | ConvertTo-Json
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" -Method POST -Body $body -ContentType "application/json"
        return $response.data.token
    } catch {
        Write-Host "❌ Failed to login as $role" -ForegroundColor Red
        return $null
    }
}

# Test API endpoint
function Test-Endpoint {
    param($role, $endpoint, $shouldSucceed)
    
    $token = Get-AuthToken -role $role
    if (-not $token) { return $false }
    
    $headers = @{
        "Authorization" = "Bearer $token"
    }
    
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl$endpoint" -Method GET -Headers $headers
        
        if ($shouldSucceed) {
            Write-Host "  ✅ $role can access $endpoint" -ForegroundColor Green
            return $true
        } else {
            Write-Host "  ❌ $role accessed $endpoint (should be blocked!)" -ForegroundColor Red
            return $false
        }
    } catch {
        if ($_.Exception.Response.StatusCode -eq 403) {
            if (-not $shouldSucceed) {
                Write-Host "  ✅ $role blocked from $endpoint (403 Forbidden)" -ForegroundColor Green
                return $true
            } else {
                Write-Host "  ❌ $role blocked from $endpoint (should have access!)" -ForegroundColor Red
                return $false
            }
        } else {
            Write-Host "  ⚠️  Error testing $role on $endpoint : $($_.Exception.Message)" -ForegroundColor Yellow
            return $false
        }
    }
}

Write-Host "`n[Test 1: ADMIN Role - Full Access]" -ForegroundColor Yellow
Write-Host "Testing ADMIN can access all endpoints..." -ForegroundColor Gray

$adminTests = @(
    @{ endpoint = "/api/sales"; shouldSucceed = $true }
    @{ endpoint = "/api/customers"; shouldSucceed = $true }
    @{ endpoint = "/api/suppliers"; shouldSucceed = $true }
    @{ endpoint = "/api/accounting/chart-of-accounts"; shouldSucceed = $true }
    @{ endpoint = "/api/admin/users"; shouldSucceed = $true }
)

foreach ($test in $adminTests) {
    if (Test-Endpoint -role "ADMIN" -endpoint $test.endpoint -shouldSucceed $test.shouldSucceed) {
        $passed++
    } else {
        $failed++
    }
}

Write-Host "`n[Test 2: MANAGER Role - Operations Access]" -ForegroundColor Yellow
Write-Host "Testing MANAGER has operations access but not admin..." -ForegroundColor Gray

$managerTests = @(
    @{ endpoint = "/api/sales"; shouldSucceed = $true }
    @{ endpoint = "/api/customers"; shouldSucceed = $true }
    @{ endpoint = "/api/suppliers"; shouldSucceed = $true }
    @{ endpoint = "/api/accounting/general-ledger"; shouldSucceed = $true }
    @{ endpoint = "/api/admin/users"; shouldSucceed = $false }  # No admin access
    @{ endpoint = "/api/settings"; shouldSucceed = $false }  # No settings access
)

foreach ($test in $managerTests) {
    if (Test-Endpoint -role "MANAGER" -endpoint $test.endpoint -shouldSucceed $test.shouldSucceed) {
        $passed++
    } else {
        $failed++
    }
}

Write-Host "`n[Test 3: CASHIER Role - Sales Only]" -ForegroundColor Yellow
Write-Host "Testing CASHIER has sales access but not accounting/admin..." -ForegroundColor Gray

$cashierTests = @(
    @{ endpoint = "/api/sales"; shouldSucceed = $true }
    @{ endpoint = "/api/customers"; shouldSucceed = $true }
    @{ endpoint = "/api/suppliers"; shouldSucceed = $false }  # No supplier access
    @{ endpoint = "/api/accounting/general-ledger"; shouldSucceed = $false }  # No accounting
    @{ endpoint = "/api/admin/users"; shouldSucceed = $false }  # No admin
)

foreach ($test in $cashierTests) {
    if (Test-Endpoint -role "CASHIER" -endpoint $test.endpoint -shouldSucceed $test.shouldSucceed) {
        $passed++
    } else {
        $failed++
    }
}

Write-Host "`n[Test 4: STAFF Role - View Only]" -ForegroundColor Yellow
Write-Host "Testing STAFF has minimal view-only access..." -ForegroundColor Gray

$staffTests = @(
    @{ endpoint = "/api/inventory"; shouldSucceed = $true }  # View inventory
    @{ endpoint = "/api/sales"; shouldSucceed = $false }  # No sales
    @{ endpoint = "/api/customers"; shouldSucceed = $false }  # No customers
    @{ endpoint = "/api/accounting/general-ledger"; shouldSucceed = $false }  # No accounting
    @{ endpoint = "/api/admin/users"; shouldSucceed = $false }  # No admin
)

foreach ($test in $staffTests) {
    if (Test-Endpoint -role "STAFF" -endpoint $test.endpoint -shouldSucceed $test.shouldSucceed) {
        $passed++
    } else {
        $failed++
    }
}

Write-Host "`n[Test 5: Token Efficiency]" -ForegroundColor Yellow
Write-Host "Testing authentication performance..." -ForegroundColor Gray

$tokenTests = @("ADMIN", "MANAGER", "CASHIER", "STAFF")
$tokenTimes = @()

foreach ($role in $tokenTests) {
    $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
    $token = Get-AuthToken -role $role
    $stopwatch.Stop()
    
    if ($token) {
        $ms = $stopwatch.ElapsedMilliseconds
        $tokenTimes += $ms
        Write-Host "  ✅ $role login: ${ms}ms" -ForegroundColor Green
        $passed++
    } else {
        Write-Host "  ❌ $role login failed" -ForegroundColor Red
        $failed++
    }
}

$avgTime = ($tokenTimes | Measure-Object -Average).Average
Write-Host "  📊 Average login time: $([math]::Round($avgTime, 2))ms" -ForegroundColor Cyan

if ($avgTime -lt 500) {
    Write-Host "  ✅ Efficiency: EXCELLENT (< 500ms)" -ForegroundColor Green
    $passed++
} elseif ($avgTime -lt 1000) {
    Write-Host "  ⚠️  Efficiency: ACCEPTABLE (< 1s)" -ForegroundColor Yellow
    $passed++
} else {
    Write-Host "  ❌ Efficiency: POOR (> 1s)" -ForegroundColor Red
    $failed++
}

# Summary
Write-Host "`n===============================================" -ForegroundColor Cyan
Write-Host "  Test Results Summary" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan

$total = $passed + $failed
$successRate = [math]::Round(($passed / $total) * 100, 2)

Write-Host "`nTotal Tests: $total" -ForegroundColor White
Write-Host "Passed: $passed" -ForegroundColor Green
Write-Host "Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })
Write-Host "Success Rate: $successRate%" -ForegroundColor $(if ($successRate -ge 90) { "Green" } elseif ($successRate -ge 70) { "Yellow" } else { "Red" })

if ($failed -eq 0) {
    Write-Host "`n🎉 All tests passed! RBAC system is working efficiently and accurately." -ForegroundColor Green
} elseif ($successRate -ge 70) {
    Write-Host "`n⚠️  Some tests failed. Review the errors above." -ForegroundColor Yellow
} else {
    Write-Host "`n❌ Multiple tests failed. RBAC system needs attention." -ForegroundColor Red
}

Write-Host "`n===============================================`n" -ForegroundColor Cyan

# Exit with appropriate code
if ($failed -eq 0) {
    exit 0
} else {
    exit 1
}
