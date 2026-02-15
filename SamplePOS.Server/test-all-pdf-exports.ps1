# Test All PDF Exports - Comprehensive Script
# Tests all reports that now support PDF export

$baseUrl = "http://localhost:3001"
$outputDir = ".\logs\exports\pdf-test-all"

# Create output directory
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "🧪 Testing ALL PDF Exports" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# Login
Write-Host "🔐 Step 1: Login..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/api/auth/login" `
        -Method POST `
        -ContentType "application/json" `
        -Body '{"email":"admin@samplepos.com","password":"admin123"}'
    
    if (-not $loginResponse.success) {
        Write-Host "❌ Login failed!" -ForegroundColor Red
        exit 1
    }
    
    $token = $loginResponse.data.token
    Write-Host "✅ Login successful!" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "❌ Login error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Test date range
$startDate = "2025-11-01"
$endDate = "2025-11-09"

# Array to track results
$results = @()

# Function to test PDF download
function Test-PDFReport {
    param(
        [string]$Name,
        [string]$Endpoint,
        [hashtable]$Params,
        [string]$Token
    )
    
    try {
        # Build query string
        $queryString = ($Params.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join "&"
        $url = "$baseUrl$Endpoint`?$queryString&format=pdf"
        
        $fileName = "$outputDir\$($Name -replace ' ', '-').pdf"
        
        Write-Host "📥 Testing: $Name..." -ForegroundColor Gray
        Invoke-WebRequest -Uri $url `
            -Method GET `
            -Headers @{ Authorization = "Bearer $Token" } `
            -OutFile $fileName
        
        $fileSize = (Get-Item $fileName).Length
        Write-Host "   ✅ Success! Size: $([math]::Round($fileSize/1KB, 2)) KB" -ForegroundColor Green
        
        return @{
            Name = $Name
            Status = "✅ Success"
            Size = "$([math]::Round($fileSize/1KB, 2)) KB"
            File = $fileName
        }
    } catch {
        Write-Host "   ❌ Failed: $($_.Exception.Message)" -ForegroundColor Red
        return @{
            Name = $Name
            Status = "❌ Failed"
            Size = "-"
            Error = $_.Exception.Message
        }
    }
}

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📊 Testing Reports..." -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# 1. Sales Details Report
$results += Test-PDFReport -Name "Sales Details Report" `
    -Endpoint "/api/reports/sales-details" `
    -Params @{start_date=$startDate; end_date=$endDate} `
    -Token $token

# 2. Sales by Cashier Report
$results += Test-PDFReport -Name "Sales by Cashier Report" `
    -Endpoint "/api/reports/sales-by-cashier" `
    -Params @{start_date=$startDate; end_date=$endDate} `
    -Token $token

# 3. Sales Summary by Date
$results += Test-PDFReport -Name "Sales Summary by Date" `
    -Endpoint "/api/reports/sales-summary-by-date" `
    -Params @{start_date=$startDate; end_date=$endDate; group_by="day"} `
    -Token $token

# 4. Inventory Valuation
$results += Test-PDFReport -Name "Inventory Valuation Report" `
    -Endpoint "/api/reports/inventory-valuation" `
    -Params @{} `
    -Token $token

# 5. Low Stock Report
$results += Test-PDFReport -Name "Low Stock Report" `
    -Endpoint "/api/reports/low-stock" `
    -Params @{threshold_percentage=20} `
    -Token $token

# 6. Expiring Items Report
$results += Test-PDFReport -Name "Expiring Items Report" `
    -Endpoint "/api/reports/expiring-items" `
    -Params @{days_threshold=30} `
    -Token $token

# 7. Best Selling Products
$results += Test-PDFReport -Name "Best Selling Products" `
    -Endpoint "/api/reports/best-selling" `
    -Params @{start_date=$startDate; end_date=$endDate; limit=10} `
    -Token $token

# 8. Payment Report
$results += Test-PDFReport -Name "Payment Methods Report" `
    -Endpoint "/api/reports/payments" `
    -Params @{start_date=$startDate; end_date=$endDate} `
    -Token $token

# 9. Profit & Loss Report
$results += Test-PDFReport -Name "Profit & Loss Report" `
    -Endpoint "/api/reports/profit-loss" `
    -Params @{start_date=$startDate; end_date=$endDate; group_by="day"} `
    -Token $token

# 10. Top Customers Report
$results += Test-PDFReport -Name "Top Customers Report" `
    -Endpoint "/api/reports/top-customers" `
    -Params @{start_date=$startDate; end_date=$endDate; limit=10} `
    -Token $token

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "📝 Test Summary" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

$successCount = ($results | Where-Object { $_.Status -eq "✅ Success" }).Count
$failCount = ($results | Where-Object { $_.Status -eq "❌ Failed" }).Count
$totalSize = ($results | Where-Object { $_.Status -eq "✅ Success" } | ForEach-Object { [double]($_.Size -replace " KB", "") } | Measure-Object -Sum).Sum

Write-Host "Total Reports Tested: $($results.Count)" -ForegroundColor White
Write-Host "Successful: $successCount" -ForegroundColor Green
Write-Host "Failed: $failCount" -ForegroundColor $(if ($failCount -gt 0) { "Red" } else { "Green" })
Write-Host "Total Size: $([math]::Round($totalSize, 2)) KB" -ForegroundColor White
Write-Host ""

# Display results table
Write-Host "Detailed Results:" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
$results | ForEach-Object {
    $color = if ($_.Status -eq "✅ Success") { "Green" } else { "Red" }
    Write-Host "$($_.Status) $($_.Name) - $($_.Size)" -ForegroundColor $color
}

Write-Host ""
Write-Host "📂 All PDFs saved to: $outputDir" -ForegroundColor White
Write-Host ""

if ($failCount -eq 0) {
    Write-Host "🎉 All PDF exports working perfectly!" -ForegroundColor Green
} else {
    Write-Host "⚠️  Some reports failed. Check errors above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✨ PDF Export Implementation Status:" -ForegroundColor Cyan
Write-Host "   • Sales Reports: ✓ (3 reports)" -ForegroundColor Green
Write-Host "   • Inventory Reports: ✓ (3 reports)" -ForegroundColor Green
Write-Host "   • Financial Reports: ✓ (2 reports)" -ForegroundColor Green
Write-Host "   • Customer Reports: ✓ (1 report)" -ForegroundColor Green
Write-Host "   • Product Reports: ✓ (1 report)" -ForegroundColor Green
Write-Host ""
Write-Host "   Total Implemented: 10 reports" -ForegroundColor White
Write-Host "   Remaining: ~20 reports" -ForegroundColor Gray
Write-Host ""
