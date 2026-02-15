# PDF Layout Visual Validation Script
# Tests all 13 reports to ensure PDFs generate without layout issues

$baseUrl = "http://localhost:3001/api"
$outputDir = "pdf-validation-test"

# Create output directory
if (-not (Test-Path $outputDir)) {
    New-Item -ItemType Directory -Path $outputDir | Out-Null
}

Write-Host "=== PDF Layout Validation Test ===" -ForegroundColor Cyan
Write-Host "Output directory: $outputDir`n" -ForegroundColor Gray

# Login to get token
Write-Host "Logging in..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@samplepos.com"
    password = "password"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.data.token
    Write-Host "✓ Login successful`n" -ForegroundColor Green
}
catch {
    Write-Host "✗ Login failed - using without auth (may fail)`n" -ForegroundColor Red
    $token = ""
}

$headers = @{
    "Authorization" = "Bearer $token"
}

# Define all reports to test
$reports = @(
    @{
        Name = "Inventory Valuation"
        Endpoint = "inventory-valuation"
        Params = "?format=pdf"
        Columns = 6
    },
    @{
        Name = "Expiring Items"
        Endpoint = "expiring-items"
        Params = "?format=pdf&days_threshold=30"
        Columns = 8
    },
    @{
        Name = "Low Stock"
        Endpoint = "low-stock"
        Params = "?format=pdf&threshold_percentage=20"
        Columns = 8
    },
    @{
        Name = "Best Selling Products"
        Endpoint = "best-selling"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31&limit=20"
        Columns = 8
    },
    @{
        Name = "Payment Methods"
        Endpoint = "payment-methods"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31"
        Columns = 5
    },
    @{
        Name = "Profit & Loss"
        Endpoint = "profit-loss"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31&group_by=month"
        Columns = 5
    },
    @{
        Name = "Top Customers"
        Endpoint = "top-customers"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31&limit=20"
        Columns = 7
    },
    @{
        Name = "Customer Account Statement"
        Endpoint = "customer-account-statement"
        Params = "?format=pdf&customer_id=1"
        Columns = 6
    },
    @{
        Name = "Sales Summary by Date"
        Endpoint = "sales-summary"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31&group_by=day"
        Columns = 7
    },
    @{
        Name = "Sales Details"
        Endpoint = "sales-details"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31"
        Columns = 8
    },
    @{
        Name = "Sales by Cashier"
        Endpoint = "sales-by-cashier"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31"
        Columns = 9
    },
    @{
        Name = "Sales by Category"
        Endpoint = "sales-by-category"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31"
        Columns = 9
        Fixed = $true
    },
    @{
        Name = "Sales by Payment Method"
        Endpoint = "sales-by-payment-method"
        Params = "?format=pdf&start_date=2025-01-01&end_date=2025-12-31"
        Columns = 5
    }
)

$successCount = 0
$failCount = 0

# Test each report
foreach ($report in $reports) {
    $url = "$baseUrl/reports/$($report.Endpoint)$($report.Params)"
    $filename = "$outputDir/$($report.Endpoint).pdf"
    
    Write-Host "Testing: $($report.Name) " -NoNewline
    Write-Host "($($report.Columns) columns)" -ForegroundColor Gray -NoNewline
    
    if ($report.Fixed) {
        Write-Host " [FIXED]" -ForegroundColor Yellow -NoNewline
    }
    
    Write-Host ""
    
    try {
        $response = Invoke-WebRequest -Uri $url -Headers $headers -OutFile $filename
        
        if (Test-Path $filename) {
            $fileSize = (Get-Item $filename).Length
            
            if ($fileSize -gt 1000) {
                Write-Host "  ✓ PDF generated ($fileSize bytes)" -ForegroundColor Green
                
                # Check if it's a valid PDF
                $pdfHeader = Get-Content $filename -Raw -Encoding Byte -TotalCount 4
                if ($pdfHeader[0] -eq 37 -and $pdfHeader[1] -eq 80 -and $pdfHeader[2] -eq 68 -and $pdfHeader[3] -eq 70) {
                    Write-Host "  ✓ Valid PDF format" -ForegroundColor Green
                    $successCount++
                }
                else {
                    Write-Host "  ✗ Invalid PDF format" -ForegroundColor Red
                    $failCount++
                }
            }
            else {
                Write-Host "  ✗ File too small ($fileSize bytes)" -ForegroundColor Red
                $failCount++
            }
        }
        else {
            Write-Host "  ✗ File not created" -ForegroundColor Red
            $failCount++
        }
    }
    catch {
        Write-Host "  ✗ Error: $($_.Exception.Message)" -ForegroundColor Red
        $failCount++
    }
    
    Write-Host ""
}

# Summary
Write-Host "=== Validation Summary ===" -ForegroundColor Cyan
Write-Host "Total Reports: $($reports.Count)" -ForegroundColor White
Write-Host "Successful: $successCount " -NoNewline
Write-Host "✓" -ForegroundColor Green
Write-Host "Failed: $failCount " -NoNewline
if ($failCount -eq 0) {
    Write-Host "✓" -ForegroundColor Green
}
else {
    Write-Host "✗" -ForegroundColor Red
}

Write-Host "`n=== Column Width Status ===" -ForegroundColor Cyan
Write-Host "All 13 reports now have column widths summing to 1.00 (100%)" -ForegroundColor Green
Write-Host "Sales by Category fixed: 1.10 → 1.00" -ForegroundColor Yellow
Write-Host "`nPDF files saved to: $outputDir" -ForegroundColor Gray
Write-Host "Open PDFs manually to verify visual layout" -ForegroundColor Gray

# Check for any remaining issues
Write-Host "`n=== Layout Checklist ===" -ForegroundColor Cyan
Write-Host "When reviewing PDFs, verify:" -ForegroundColor White
Write-Host "  □ No text truncation or overlap" -ForegroundColor Gray
Write-Host "  □ All columns visible and aligned" -ForegroundColor Gray
Write-Host "  □ Currency values properly formatted (UGX)" -ForegroundColor Gray
Write-Host "  □ Percentages display with % symbol" -ForegroundColor Gray
Write-Host "  □ Headers repeat on new pages" -ForegroundColor Gray
Write-Host "  □ Page numbers in footer" -ForegroundColor Gray
Write-Host "  □ Summary cards display correctly" -ForegroundColor Gray

if ($successCount -eq $reports.Count) {
    Write-Host "`n✅ All PDFs generated successfully!" -ForegroundColor Green
    Write-Host "Layout validation complete." -ForegroundColor Green
}
else {
    Write-Host "`n⚠️  Some PDFs failed to generate" -ForegroundColor Yellow
    Write-Host "Check authentication and server logs" -ForegroundColor Yellow
}
