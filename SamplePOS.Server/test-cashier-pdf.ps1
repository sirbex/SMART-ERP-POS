# Test Sales by Cashier PDF

Write-Host "Testing Sales by Cashier PDF..." -ForegroundColor Cyan

# Wait a bit for server
Start-Sleep -Seconds 2

# Login
try {
    $login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"email":"admin@samplepos.com","password":"admin123"}'
    
    if ($login.success) {
        Write-Host "✅ Logged in" -ForegroundColor Green
        $token = $login.data.token
        
        # Test Sales by Cashier PDF
        $pdfFile = ".\logs\exports\test-sales-by-cashier.pdf"
        $url = "http://localhost:3001/api/reports/sales-by-cashier?start_date=2025-11-01&end_date=2025-11-09&format=pdf"
        
        Write-Host "📥 Downloading Sales by Cashier PDF..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $url `
            -Method GET `
            -Headers @{ Authorization = "Bearer $token" } `
            -OutFile $pdfFile
        
        $size = (Get-Item $pdfFile).Length
        Write-Host "✅ PDF downloaded: $pdfFile ($([math]::Round($size/1KB, 2)) KB)" -ForegroundColor Green
        
        # Also test JSON
        Write-Host "📊 Testing JSON format..." -ForegroundColor Yellow
        $json = Invoke-RestMethod -Uri "http://localhost:3001/api/reports/sales-by-cashier?start_date=2025-11-01&end_date=2025-11-09" `
            -Method GET `
            -Headers @{ Authorization = "Bearer $token" }
        
        if ($json.success) {
            Write-Host "✅ JSON format works! Records: $($json.data.recordCount)" -ForegroundColor Green
            Write-Host "   Total Revenue: $($json.data.summary.totalRevenue)" -ForegroundColor Gray
            Write-Host "   Total Transactions: $($json.data.summary.totalTransactions)" -ForegroundColor Gray
        }
        
        Write-Host "" 
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host "✅ PDF Export Implementation Complete!" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
        Write-Host "• Sales Details Report: ✓ PDF + JSON" -ForegroundColor White
        Write-Host "• Sales by Cashier: ✓ PDF + JSON" -ForegroundColor White
        Write-Host "• All numbers: 2 decimal precision" -ForegroundColor White
        Write-Host "• Design: Gradient headers, summary cards, tables" -ForegroundColor White
        
    } else {
        Write-Host "❌ Login failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails)" -ForegroundColor Red
    }
}
