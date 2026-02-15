# Quick PDF Test - Just test one report

Write-Host "Testing PDF Export..." -ForegroundColor Cyan

# Wait a bit for server to fully start
Start-Sleep -Seconds 3

# Login
try {
    $login = Invoke-RestMethod -Uri "http://localhost:3001/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"email":"admin@samplepos.com","password":"admin123"}'
    
    if ($login.success) {
        Write-Host "✅ Logged in" -ForegroundColor Green
        $token = $login.data.token
        
        # Test PDF download
        $pdfFile = ".\logs\exports\test-sales-details.pdf"
        $url = "http://localhost:3001/api/reports/sales-details?start_date=2025-11-01&end_date=2025-11-09&format=pdf"
        
        Write-Host "📥 Downloading PDF..." -ForegroundColor Yellow
        Invoke-WebRequest -Uri $url `
            -Method GET `
            -Headers @{ Authorization = "Bearer $token" } `
            -OutFile $pdfFile
        
        $size = (Get-Item $pdfFile).Length
        Write-Host "✅ PDF downloaded: $pdfFile ($([math]::Round($size/1KB, 2)) KB)" -ForegroundColor Green
        
        # Also test JSON to ensure backward compatibility
        Write-Host "📊 Testing JSON format..." -ForegroundColor Yellow
        $json = Invoke-RestMethod -Uri "http://localhost:3001/api/reports/sales-details?start_date=2025-11-01&end_date=2025-11-09" `
            -Method GET `
            -Headers @{ Authorization = "Bearer $token" }
        
        if ($json.success) {
            Write-Host "✅ JSON format works! Records: $($json.data.recordCount)" -ForegroundColor Green
        }
        
    } else {
        Write-Host "❌ Login failed" -ForegroundColor Red
    }
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host "Details: $($_.ErrorDetails)" -ForegroundColor Red
    }
}
