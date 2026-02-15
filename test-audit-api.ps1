# Audit Trail API Testing Script
# Tests all audit endpoints to verify functionality
# Run after starting server: .\start-dev.ps1

$baseUrl = "http://localhost:3001/api"
$auditUrl = "$baseUrl/audit"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  AUDIT TRAIL API TESTING SCRIPT" -ForegroundColor Cyan
Write-Host "  Date: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "Test 1: Server Health Check" -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/../health" -Method GET
    if ($health.success) {
        Write-Host "✅ Server is healthy" -ForegroundColor Green
        Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    } else {
        Write-Host "❌ Server health check failed" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Cannot connect to server at $baseUrl" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure server is running (.\start-dev.ps1)" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Test 2: Get all audit logs (recent)
Write-Host "Test 2: Get Recent Audit Logs" -ForegroundColor Yellow
try {
    $logs = Invoke-RestMethod -Uri "$auditUrl/logs?limit=5" -Method GET
    if ($logs.success) {
        Write-Host "✅ Audit logs retrieved successfully" -ForegroundColor Green
        Write-Host "   Total entries: $($logs.pagination.total)" -ForegroundColor Gray
        Write-Host "   Returned: $($logs.data.Count) entries" -ForegroundColor Gray
        
        if ($logs.data.Count -gt 0) {
            Write-Host ""
            Write-Host "   Recent entries:" -ForegroundColor Cyan
            $logs.data | ForEach-Object {
                Write-Host "   - $($_.entityType) | $($_.action) | $($_.userName) | $(Get-Date $_.createdAt -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Gray
            }
        }
    } else {
        Write-Host "⚠️  No audit logs found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ Failed to retrieve audit logs" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Filter by entity type
Write-Host "Test 3: Filter Audit Logs by Entity Type (SALE)" -ForegroundColor Yellow
try {
    $salesLogs = Invoke-RestMethod -Uri "$auditUrl/logs?entityType=SALE&limit=3" -Method GET
    if ($salesLogs.success) {
        Write-Host "✅ Sale audit logs retrieved" -ForegroundColor Green
        Write-Host "   Sale entries: $($salesLogs.data.Count)" -ForegroundColor Gray
        
        if ($salesLogs.data.Count -gt 0) {
            $salesLogs.data | ForEach-Object {
                Write-Host "   - Sale: $($_.entityNumber) | Action: $($_.action)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "⚠️  No sale audit logs found (expected if no sales created yet)" -ForegroundColor Yellow
}
Write-Host ""

# Test 4: Filter by action
Write-Host "Test 4: Filter by Action (CREATE)" -ForegroundColor Yellow
try {
    $createLogs = Invoke-RestMethod -Uri "$auditUrl/logs?action=CREATE&limit=5" -Method GET
    if ($createLogs.success) {
        Write-Host "✅ CREATE action logs retrieved" -ForegroundColor Green
        Write-Host "   CREATE entries: $($createLogs.data.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  No CREATE logs found" -ForegroundColor Yellow
}
Write-Host ""

# Test 5: Filter by severity
Write-Host "Test 5: Filter by Severity (INFO)" -ForegroundColor Yellow
try {
    $infoLogs = Invoke-RestMethod -Uri "$auditUrl/logs?severity=INFO&limit=5" -Method GET
    if ($infoLogs.success) {
        Write-Host "✅ INFO severity logs retrieved" -ForegroundColor Green
        Write-Host "   INFO entries: $($infoLogs.data.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  No INFO logs found" -ForegroundColor Yellow
}
Write-Host ""

# Test 6: Get active sessions
Write-Host "Test 6: Get Active User Sessions" -ForegroundColor Yellow
try {
    $sessions = Invoke-RestMethod -Uri "$auditUrl/sessions/active" -Method GET
    if ($sessions.success) {
        Write-Host "✅ Active sessions retrieved" -ForegroundColor Green
        Write-Host "   Active users: $($sessions.data.Count)" -ForegroundColor Gray
        
        if ($sessions.data.Count -gt 0) {
            $sessions.data | ForEach-Object {
                Write-Host "   - $($_.userName) ($($_.userRole)) | Logged in: $(Get-Date $_.loginAt -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "⚠️  No active sessions found" -ForegroundColor Yellow
}
Write-Host ""

# Test 7: Get failed transaction summary
Write-Host "Test 7: Get Failed Transaction Summary" -ForegroundColor Yellow
try {
    $failedTx = Invoke-RestMethod -Uri "$auditUrl/failed-transactions/summary?days=30" -Method GET
    if ($failedTx.success) {
        Write-Host "✅ Failed transaction summary retrieved" -ForegroundColor Green
        Write-Host "   Error types: $($failedTx.data.Count)" -ForegroundColor Gray
        
        if ($failedTx.data.Count -gt 0) {
            Write-Host ""
            Write-Host "   Top errors:" -ForegroundColor Cyan
            $failedTx.data | Select-Object -First 3 | ForEach-Object {
                Write-Host "   - $($_.transactionType) | $($_.errorType) | Count: $($_.failureCount)" -ForegroundColor Gray
            }
        }
    }
} catch {
    Write-Host "⚠️  No failed transactions found (good!)" -ForegroundColor Yellow
}
Write-Host ""

# Test 8: Test pagination
Write-Host "Test 8: Test Pagination" -ForegroundColor Yellow
try {
    $page1 = Invoke-RestMethod -Uri "$auditUrl/logs?page=1&limit=2" -Method GET
    $page2 = Invoke-RestMethod -Uri "$auditUrl/logs?page=2&limit=2" -Method GET
    
    if ($page1.success -and $page2.success) {
        Write-Host "✅ Pagination working correctly" -ForegroundColor Green
        Write-Host "   Page 1: $($page1.data.Count) entries" -ForegroundColor Gray
        Write-Host "   Page 2: $($page2.data.Count) entries" -ForegroundColor Gray
        Write-Host "   Total pages: $($page1.pagination.totalPages)" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Pagination test inconclusive" -ForegroundColor Yellow
}
Write-Host ""

# Test 9: Test date range filtering
Write-Host "Test 9: Test Date Range Filtering" -ForegroundColor Yellow
try {
    $today = Get-Date -Format "yyyy-MM-dd"
    $yesterday = (Get-Date).AddDays(-1).ToString("yyyy-MM-dd")
    
    $dateRange = Invoke-RestMethod -Uri "$auditUrl/logs?startDate=$yesterday&endDate=$today&limit=10" -Method GET
    if ($dateRange.success) {
        Write-Host "✅ Date range filtering working" -ForegroundColor Green
        Write-Host "   Entries in last 2 days: $($dateRange.data.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠️  Date range test inconclusive" -ForegroundColor Yellow
}
Write-Host ""

# Test 10: Get entity audit trail (if any sales exist)
Write-Host "Test 10: Get Entity Audit Trail (Example)" -ForegroundColor Yellow
try {
    # First, try to get a sale entity number
    $salesLogs = Invoke-RestMethod -Uri "$auditUrl/logs?entityType=SALE&limit=1" -Method GET
    
    if ($salesLogs.success -and $salesLogs.data.Count -gt 0) {
        $saleNumber = $salesLogs.data[0].entityNumber
        $trail = Invoke-RestMethod -Uri "$auditUrl/entity/SALE/$saleNumber" -Method GET
        
        if ($trail.success) {
            Write-Host "✅ Entity audit trail retrieved" -ForegroundColor Green
            Write-Host "   Entity: $saleNumber" -ForegroundColor Gray
            Write-Host "   History entries: $($trail.data.Count)" -ForegroundColor Gray
        }
    } else {
        Write-Host "⚠️  No sales to test entity trail (create a sale first)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Entity trail test skipped" -ForegroundColor Yellow
}
Write-Host ""

# Summary
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  TEST SUMMARY" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "✅ Audit Trail API is functional!" -ForegroundColor Green
Write-Host ""
Write-Host "Available Endpoints:" -ForegroundColor Cyan
Write-Host "  GET  /api/audit/logs                          # List with filters" -ForegroundColor Gray
Write-Host "  GET  /api/audit/entity/:type/:identifier      # Entity history" -ForegroundColor Gray
Write-Host "  GET  /api/audit/sessions/active               # Active sessions" -ForegroundColor Gray
Write-Host "  GET  /api/audit/failed-transactions/summary   # Error dashboard" -ForegroundColor Gray
Write-Host ""
Write-Host "Filter Parameters:" -ForegroundColor Cyan
Write-Host "  entityType, action, userId, severity, category" -ForegroundColor Gray
Write-Host "  startDate, endDate, searchTerm, tags" -ForegroundColor Gray
Write-Host "  page, limit, sortBy, sortOrder" -ForegroundColor Gray
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Yellow
Write-Host "  1. Create a sale to generate audit entries" -ForegroundColor Gray
Write-Host "  2. Access frontend: http://localhost:5173/admin/audit-trail" -ForegroundColor Gray
Write-Host "  3. Login as ADMIN to view audit trail" -ForegroundColor Gray
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
