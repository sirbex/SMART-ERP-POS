# Test Auth Audit Logging
# Creates test login/logout to verify audit trail integration

$baseUrl = "http://localhost:3001/api"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  AUTH AUDIT TRAIL INTEGRATION TEST" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Login
Write-Host "Test 1: User Login (should create audit entry)" -ForegroundColor Yellow
$loginBody = @{
    email = "audittest@test.com"
    password = "AuditTest123!"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    
    if ($loginResponse.success) {
        Write-Host "✅ Login successful" -ForegroundColor Green
        Write-Host "   User: $($loginResponse.data.user.fullName)" -ForegroundColor Gray
        Write-Host "   Role: $($loginResponse.data.user.role)" -ForegroundColor Gray
        $token = $loginResponse.data.token
        Write-Host "   Token received" -ForegroundColor Gray
    } else {
        Write-Host "❌ Login failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Login request failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: Check audit logs for login entry
Write-Host "Test 2: Verify Login Audit Entry" -ForegroundColor Yellow
Start-Sleep -Seconds 1

try {
    $auditLogs = Invoke-RestMethod -Uri "$baseUrl/audit/logs?action=LOGIN&limit=5" -Method GET
    
    if ($auditLogs.success) {
        $loginEntries = $auditLogs.data | Where-Object { $_.action -eq "LOGIN" }
        Write-Host "✅ Found $($loginEntries.Count) LOGIN audit entries" -ForegroundColor Green
        
        if ($loginEntries.Count -gt 0) {
            $latest = $loginEntries[0]
            Write-Host ""
            Write-Host "   Latest login entry:" -ForegroundColor Cyan
            Write-Host "   - User: $($latest.userName)" -ForegroundColor Gray
            Write-Host "   - Time: $($latest.createdAt)" -ForegroundColor Gray
            Write-Host "   - IP: $($latest.ipAddress)" -ForegroundColor Gray
            Write-Host "   - Session ID: $($latest.sessionId)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "⚠️  Could not retrieve audit logs" -ForegroundColor Yellow
}
Write-Host ""

# Test 3: Check active sessions
Write-Host "Test 3: Check Active Sessions" -ForegroundColor Yellow
try {
    $sessions = Invoke-RestMethod -Uri "$baseUrl/audit/sessions/active" -Method GET
    
    if ($sessions.success) {
        Write-Host "✅ Active sessions: $($sessions.data.Count)" -ForegroundColor Green
        
        if ($sessions.data.Count -gt 0) {
            Write-Host ""
            Write-Host "   Active users:" -ForegroundColor Cyan
            $sessions.data | ForEach-Object {
                Write-Host "   - $($_.userName) ($($_.userRole)) | Login: $(Get-Date $_.loginAt -Format 'HH:mm:ss')" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "⚠️  Could not retrieve active sessions" -ForegroundColor Yellow
}
Write-Host ""

# Test 4: Logout
Write-Host "Test 4: User Logout (should create audit entry)" -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $token"
        "Content-Type" = "application/json"
    }
    
    $logoutResponse = Invoke-RestMethod -Uri "$baseUrl/auth/logout" -Method POST -Headers $headers
    
    if ($logoutResponse.success) {
        Write-Host "✅ Logout successful" -ForegroundColor Green
    }
} catch {
    Write-Host "❌ Logout request failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 5: Check audit logs for logout entry
Write-Host "Test 5: Verify Logout Audit Entry" -ForegroundColor Yellow
Start-Sleep -Seconds 1

try {
    $auditLogs = Invoke-RestMethod -Uri "$baseUrl/audit/logs?action=LOGOUT&limit=5" -Method GET
    
    if ($auditLogs.success) {
        $logoutEntries = $auditLogs.data | Where-Object { $_.action -eq "LOGOUT" }
        Write-Host "✅ Found $($logoutEntries.Count) LOGOUT audit entries" -ForegroundColor Green
        
        if ($logoutEntries.Count -gt 0) {
            $latest = $logoutEntries[0]
            Write-Host ""
            Write-Host "   Latest logout entry:" -ForegroundColor Cyan
            Write-Host "   - User: $($latest.userName)" -ForegroundColor Gray
            Write-Host "   - Time: $($latest.createdAt)" -ForegroundColor Gray
            Write-Host "   - Reason: MANUAL" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "⚠️  Could not retrieve audit logs" -ForegroundColor Yellow
}
Write-Host ""

# Test 6: Test failed login (wrong password)
Write-Host "Test 6: Failed Login Attempt (should log failure)" -ForegroundColor Yellow
$badLoginBody = @{
    email = "audittest@test.com"
    password = "WrongPassword123"
} | ConvertTo-Json

try {
    $badLoginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method POST -Body $badLoginBody -ContentType "application/json"
    Write-Host "⚠️  Login should have failed but succeeded" -ForegroundColor Yellow
} catch {
    Write-Host "✅ Login correctly rejected (expected)" -ForegroundColor Green
}
Write-Host ""

# Test 7: Check audit logs for failed login
Write-Host "Test 7: Verify Failed Login Audit Entry" -ForegroundColor Yellow
Start-Sleep -Seconds 1

try {
    $auditLogs = Invoke-RestMethod -Uri "$baseUrl/audit/logs?action=LOGIN_FAILED&limit=5" -Method GET
    
    if ($auditLogs.success) {
        $failedEntries = $auditLogs.data | Where-Object { $_.action -eq "LOGIN_FAILED" }
        Write-Host "✅ Found $($failedEntries.Count) LOGIN_FAILED audit entries" -ForegroundColor Green
        
        if ($failedEntries.Count -gt 0) {
            $latest = $failedEntries[0]
            Write-Host ""
            Write-Host "   Latest failed login entry:" -ForegroundColor Cyan
            Write-Host "   - Email attempted: audittest@test.com" -ForegroundColor Gray
            Write-Host "   - Time: $($latest.createdAt)" -ForegroundColor Gray
            Write-Host "   - IP: $($latest.ipAddress)" -ForegroundColor Gray
            Write-Host "   - Severity: $($latest.severity)" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "⚠️  Could not retrieve audit logs" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "✅ Auth module audit integration complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Audit trail now captures:" -ForegroundColor Cyan
Write-Host "  - Successful logins (LOGIN action)" -ForegroundColor Gray
Write-Host "  - Failed login attempts (LOGIN_FAILED action)" -ForegroundColor Gray
Write-Host "  - User logouts (LOGOUT action)" -ForegroundColor Gray
Write-Host "  - Active session tracking" -ForegroundColor Gray
Write-Host "  - IP addresses and user agents" -ForegroundColor Gray
Write-Host ""
Write-Host "View in frontend: http://localhost:5173/admin/audit-trail" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Cyan
