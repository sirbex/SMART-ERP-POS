# Test Reports API Endpoints
# Verifies all GET and POST endpoints are working correctly

$baseUrl = "http://localhost:3001/api"
$token = "" # Will be set after login

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Reports API Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Login to get auth token
Write-Host "1. Logging in..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$baseUrl/auth/login" -Method Post -Body (@{
        email = "admin@samplepos.com"
        password = "Admin123!"
    } | ConvertTo-Json) -ContentType "application/json"
    
    if ($loginResponse.success) {
        $token = $loginResponse.data.token
        Write-Host "✅ Login successful" -ForegroundColor Green
    } else {
        Write-Host "❌ Login failed: $($loginResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Login error: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Step 2: Test POST /api/reports/generate endpoint
Write-Host "2. Testing POST /api/reports/generate endpoint" -ForegroundColor Yellow
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

# Test each report type
$reportTests = @(
    @{
        Name = "Inventory Valuation"
        Body = @{
            reportType = "INVENTORY_VALUATION"
            valuationMethod = "FIFO"
        }
    },
    @{
        Name = "Sales Report"
        Body = @{
            reportType = "SALES_REPORT"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
            groupBy = "month"
        }
    },
    @{
        Name = "Expiring Items"
        Body = @{
            reportType = "EXPIRING_ITEMS"
            daysAhead = 30
        }
    },
    @{
        Name = "Low Stock"
        Body = @{
            reportType = "LOW_STOCK"
            threshold = 50
        }
    },
    @{
        Name = "Best Selling Products"
        Body = @{
            reportType = "BEST_SELLING_PRODUCTS"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
            limit = 10
        }
    },
    @{
        Name = "Supplier Cost Analysis"
        Body = @{
            reportType = "SUPPLIER_COST_ANALYSIS"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
        }
    },
    @{
        Name = "Goods Received"
        Body = @{
            reportType = "GOODS_RECEIVED"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
        }
    },
    @{
        Name = "Payment Report"
        Body = @{
            reportType = "PAYMENT_REPORT"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
        }
    },
    @{
        Name = "Customer Payments"
        Body = @{
            reportType = "CUSTOMER_PAYMENTS"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
        }
    },
    @{
        Name = "Profit & Loss"
        Body = @{
            reportType = "PROFIT_LOSS"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
            groupBy = "month"
        }
    },
    @{
        Name = "Deleted Items"
        Body = @{
            reportType = "DELETED_ITEMS"
        }
    },
    @{
        Name = "Inventory Adjustments"
        Body = @{
            reportType = "INVENTORY_ADJUSTMENTS"
            startDate = "2025-01-01T00:00:00Z"
            endDate = "2025-12-31T23:59:59Z"
        }
    }
)

$successCount = 0
$failCount = 0

foreach ($test in $reportTests) {
    Write-Host "  Testing: $($test.Name)..." -NoNewline
    try {
        $response = Invoke-RestMethod -Uri "$baseUrl/reports/generate" -Method Post `
            -Headers $headers -Body ($test.Body | ConvertTo-Json) -ContentType "application/json"
        
        if ($response.success) {
            Write-Host " ✅" -ForegroundColor Green
            Write-Host "    Records: $($response.data.recordCount), Execution: $($response.data.executionTimeMs)ms" -ForegroundColor Gray
            $successCount++
        } else {
            Write-Host " ❌ $($response.error)" -ForegroundColor Red
            $failCount++
        }
    } catch {
        Write-Host " ❌ Error: $_" -ForegroundColor Red
        $failCount++
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "✅ Passed: $successCount" -ForegroundColor Green
Write-Host "❌ Failed: $failCount" -ForegroundColor Red
Write-Host ""

if ($failCount -eq 0) {
    Write-Host "🎉 All report endpoints working correctly!" -ForegroundColor Green
} else {
    Write-Host "⚠️ Some endpoints failed. Check the output above." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Note: Some reports may return 0 records if no matching data exists in the database." -ForegroundColor Gray
Write-Host "This is expected behavior, not an error." -ForegroundColor Gray
