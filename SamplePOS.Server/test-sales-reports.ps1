# Sales Reports API Testing Script
# Tests the new product sales summary and reporting endpoints

$baseUrl = "http://localhost:3001/api"
$token = "" # Will be set after login

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Sales Reports API Tests" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

# Step 1: Login to get auth token
Write-Host "1. Logging in..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body (@{
    email = "admin@samplepos.com"
    password = "admin123"
} | ConvertTo-Json) -ContentType "application/json"

if ($loginResponse.success) {
    $token = $loginResponse.data.token
    Write-Host "   ✓ Login successful" -ForegroundColor Green
    Write-Host "   Token: $($token.Substring(0, 20))..." -ForegroundColor Gray
} else {
    Write-Host "   ✗ Login failed" -ForegroundColor Red
    exit
}

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Step 2: Get Product Sales Summary (All products)
Write-Host "`n2. Getting Product Sales Summary (All Products)..." -ForegroundColor Yellow
try {
    $summaryResponse = Invoke-RestMethod -Uri "$baseUrl/sales/reports/product-summary" -Method Get -Headers $headers
    
    if ($summaryResponse.success) {
        Write-Host "   ✓ Retrieved sales summary for $($summaryResponse.data.Count) products" -ForegroundColor Green
        
        if ($summaryResponse.data.Count -gt 0) {
            Write-Host "`n   Top 5 Products by Revenue:" -ForegroundColor Cyan
            $summaryResponse.data | Select-Object -First 5 | ForEach-Object {
                Write-Host "   - $($_.product_name)" -ForegroundColor White
                Write-Host "     Qty Sold: $($_.total_quantity_sold) | Revenue: $($_.total_revenue) | Profit: $($_.total_profit) | Margin: $($_.profit_margin_pct)%" -ForegroundColor Gray
            }
        } else {
            Write-Host "   ℹ No sales data found" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 3: Get Product Sales Summary with Date Filter (Last 30 days)
Write-Host "`n3. Getting Product Sales Summary (Last 30 Days)..." -ForegroundColor Yellow
$startDate = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd")
$endDate = (Get-Date).ToString("yyyy-MM-dd")

try {
    $dateFilterResponse = Invoke-RestMethod -Uri "$baseUrl/sales/reports/product-summary?startDate=$startDate&endDate=$endDate" -Method Get -Headers $headers
    
    if ($dateFilterResponse.success) {
        Write-Host "   ✓ Retrieved sales summary for $($dateFilterResponse.data.Count) products (Last 30 days)" -ForegroundColor Green
        Write-Host "   Date Range: $startDate to $endDate" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 4: Get Top Selling Products
Write-Host "`n4. Getting Top 10 Selling Products..." -ForegroundColor Yellow
try {
    $topSellingResponse = Invoke-RestMethod -Uri "$baseUrl/sales/reports/top-selling?limit=10" -Method Get -Headers $headers
    
    if ($topSellingResponse.success) {
        Write-Host "   ✓ Retrieved top $($topSellingResponse.data.Count) selling products" -ForegroundColor Green
        
        if ($topSellingResponse.data.Count -gt 0) {
            Write-Host "`n   Top Selling Products:" -ForegroundColor Cyan
            $rank = 1
            $topSellingResponse.data | ForEach-Object {
                Write-Host "   $rank. $($_.product_name)" -ForegroundColor White
                Write-Host "      Quantity: $($_.total_quantity) | Revenue: $($_.total_revenue) | Sales: $($_.sale_count) transactions" -ForegroundColor Gray
                $rank++
            }
        }
    }
} catch {
    Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 5: Get Sales Summary by Day
Write-Host "`n5. Getting Sales Summary by Day (Last 7 days)..." -ForegroundColor Yellow
$startDate = (Get-Date).AddDays(-7).ToString("yyyy-MM-dd")
$endDate = (Get-Date).ToString("yyyy-MM-dd")

try {
    $dailyResponse = Invoke-RestMethod -Uri "$baseUrl/sales/reports/summary-by-date?groupBy=day&startDate=$startDate&endDate=$endDate" -Method Get -Headers $headers
    
    if ($dailyResponse.success) {
        Write-Host "   ✓ Retrieved daily sales summary for $($dailyResponse.data.Count) days" -ForegroundColor Green
        
        if ($dailyResponse.data.Count -gt 0) {
            Write-Host "`n   Daily Sales Summary:" -ForegroundColor Cyan
            $dailyResponse.data | ForEach-Object {
                $date = [DateTime]::Parse($_.period).ToString("yyyy-MM-dd")
                Write-Host "   $date" -ForegroundColor White
                Write-Host "     Transactions: $($_.transaction_count) | Revenue: $($_.total_revenue) | Profit: $($_.total_profit) | Avg: $($_.avg_transaction_value)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 6: Get Sales Summary by Week
Write-Host "`n6. Getting Sales Summary by Week (Last 4 weeks)..." -ForegroundColor Yellow
$startDate = (Get-Date).AddDays(-28).ToString("yyyy-MM-dd")

try {
    $weeklyResponse = Invoke-RestMethod -Uri "$baseUrl/sales/reports/summary-by-date?groupBy=week&startDate=$startDate&endDate=$endDate" -Method Get -Headers $headers
    
    if ($weeklyResponse.success) {
        Write-Host "   ✓ Retrieved weekly sales summary for $($weeklyResponse.data.Count) weeks" -ForegroundColor Green
        
        if ($weeklyResponse.data.Count -gt 0) {
            Write-Host "`n   Weekly Sales Summary:" -ForegroundColor Cyan
            $weeklyResponse.data | ForEach-Object {
                $weekStart = [DateTime]::Parse($_.period).ToString("yyyy-MM-dd")
                Write-Host "   Week starting $weekStart" -ForegroundColor White
                Write-Host "     Transactions: $($_.transaction_count) | Revenue: $($_.total_revenue) | Profit: $($_.total_profit)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

# Step 7: Get Sales Summary by Month
Write-Host "`n7. Getting Sales Summary by Month (Last 6 months)..." -ForegroundColor Yellow
$startDate = (Get-Date).AddMonths(-6).ToString("yyyy-MM-dd")

try {
    $monthlyResponse = Invoke-RestMethod -Uri "$baseUrl/sales/reports/summary-by-date?groupBy=month&startDate=$startDate&endDate=$endDate" -Method Get -Headers $headers
    
    if ($monthlyResponse.success) {
        Write-Host "   ✓ Retrieved monthly sales summary for $($monthlyResponse.data.Count) months" -ForegroundColor Green
        
        if ($monthlyResponse.data.Count -gt 0) {
            Write-Host "`n   Monthly Sales Summary:" -ForegroundColor Cyan
            $monthlyResponse.data | ForEach-Object {
                $month = [DateTime]::Parse($_.period).ToString("MMMM yyyy")
                Write-Host "   $month" -ForegroundColor White
                Write-Host "     Transactions: $($_.transaction_count) | Revenue: $($_.total_revenue) | Profit: $($_.total_profit)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "   ✗ Failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n============================================" -ForegroundColor Cyan
Write-Host "Sales Reports Tests Complete!" -ForegroundColor Cyan
Write-Host "============================================`n" -ForegroundColor Cyan

Write-Host "API Endpoints:" -ForegroundColor Yellow
Write-Host "  GET /api/sales/reports/product-summary" -ForegroundColor White
Write-Host "      Query params: startDate, endDate, productId, customerId" -ForegroundColor Gray
Write-Host ""
Write-Host "  GET /api/sales/reports/top-selling" -ForegroundColor White
Write-Host "      Query params: limit (default 10), startDate, endDate" -ForegroundColor Gray
Write-Host ""
Write-Host "  GET /api/sales/reports/summary-by-date" -ForegroundColor White
Write-Host "      Query params: groupBy (day/week/month), startDate, endDate" -ForegroundColor Gray
Write-Host ""
