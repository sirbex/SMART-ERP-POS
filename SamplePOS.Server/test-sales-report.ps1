# Test Sales Report API
Write-Host "`n🔄 Testing Sales Report..." -ForegroundColor Cyan

try {
    # Login
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
        -Method POST `
        -Body '{"email":"test@test.com","password":"Test1234"}' `
        -ContentType "application/json"
    
    $token = $loginResponse.data.token
    Write-Host "✅ Logged in successfully" -ForegroundColor Green
    
    # Test Sales Report
    $result = Invoke-RestMethod -Uri "http://localhost:3001/api/reports/generate" `
        -Method POST `
        -Headers @{
            "Authorization" = "Bearer $token"
            "Content-Type" = "application/json"
        } `
        -Body '{"reportType":"SALES_REPORT","startDate":"2025-01-01T00:00:00Z","endDate":"2025-12-31T23:59:59Z","groupBy":"month"}'
    
    if ($result.success) {
        Write-Host "`n✅ SALES REPORT SUCCESS!" -ForegroundColor Green
        Write-Host "Report Type: $($result.data.reportType)"
        Write-Host "Record Count: $($result.data.recordCount)"
        Write-Host "Execution Time: $($result.data.executionTimeMs)ms"
        
        if ($result.data.data.Count -gt 0) {
            Write-Host "`nFirst record:"
            $result.data.data[0] | Format-List
        }
    } else {
        Write-Host "`n❌ FAILED: $($result.error)" -ForegroundColor Red
    }
    
} catch {
    Write-Host "`n❌ Error: $_" -ForegroundColor Red
    Write-Host "Details: $($_.Exception.Message)"
}
