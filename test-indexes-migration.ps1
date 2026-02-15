# Test Performance Indexes Migration
# File: test-indexes-migration.ps1
# Purpose: Verify 100_performance_indexes.sql migration works correctly

Write-Host "`n=== Performance Indexes Migration Test ===" -ForegroundColor Cyan
Write-Host "Database: pos_system" -ForegroundColor Cyan
Write-Host "User: postgres" -ForegroundColor Cyan

# Check if PostgreSQL is running
Write-Host "`n[1/5] Checking PostgreSQL service..." -ForegroundColor Yellow
$pgService = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue
if (-not $pgService) {
    Write-Host "❌ PostgreSQL service not found!" -ForegroundColor Red
    exit 1
}
Write-Host "✅ PostgreSQL service is running" -ForegroundColor Green

# Test database connection
Write-Host "`n[2/5] Testing database connection..." -ForegroundColor Yellow
$env:PGPASSWORD = "password"
$connectionTest = psql -U postgres -d pos_system -c "SELECT version();" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to connect to database!" -ForegroundColor Red
    Write-Host $connectionTest -ForegroundColor Red
    exit 1
}
Write-Host "✅ Database connection successful" -ForegroundColor Green

# Backup current index state
Write-Host "`n[3/5] Backing up current index state..." -ForegroundColor Yellow
$backupFile = "index_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"
psql -U postgres -d pos_system -c "\copy (SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname) TO '$backupFile' CSV HEADER" | Out-Null
Write-Host "✅ Backup saved to: $backupFile" -ForegroundColor Green

# Run migration
Write-Host "`n[4/5] Running index migration..." -ForegroundColor Yellow
Write-Host "File: shared/sql/100_performance_indexes.sql" -ForegroundColor Cyan
$migrationResult = psql -U postgres -d pos_system -f "shared/sql/100_performance_indexes.sql" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Migration failed!" -ForegroundColor Red
    Write-Host $migrationResult -ForegroundColor Red
    exit 1
}
Write-Host "✅ Migration completed successfully" -ForegroundColor Green

# Verify indexes created
Write-Host "`n[5/5] Verifying indexes created..." -ForegroundColor Yellow
$indexCount = psql -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';" 2>&1
$indexCount = $indexCount.Trim()
Write-Host "✅ Total indexes: $indexCount" -ForegroundColor Green

# Show created indexes by table
Write-Host "`n=== Index Summary ===" -ForegroundColor Cyan
psql -U postgres -d pos_system -c "
SELECT 
    tablename,
    COUNT(*) as index_count,
    pg_size_pretty(SUM(pg_relation_size(indexrelid))) as total_size
FROM pg_indexes
JOIN pg_stat_user_indexes ON pg_indexes.indexname = pg_stat_user_indexes.indexname
WHERE schemaname = 'public' 
  AND pg_indexes.indexname LIKE 'idx_%'
GROUP BY tablename
ORDER BY tablename;
" 2>&1

Write-Host "`n=== Migration Test Complete ===" -ForegroundColor Green
Write-Host "`nNext Steps:" -ForegroundColor Cyan
Write-Host "1. Run queries with EXPLAIN ANALYZE to verify index usage" -ForegroundColor White
Write-Host "2. Monitor pg_stat_user_indexes after 1 hour of traffic" -ForegroundColor White
Write-Host "3. Check for unused indexes: SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0" -ForegroundColor White
Write-Host "4. Update PERFORMANCE_OPTIMIZATION_GUIDE.md with actual results" -ForegroundColor White

# Performance test queries
Write-Host "`n=== Sample Performance Tests ===" -ForegroundColor Cyan
Write-Host "Test these queries with EXPLAIN ANALYZE:" -ForegroundColor Yellow
Write-Host "
-- Product search (should use idx_products_name_lower)
EXPLAIN ANALYZE SELECT * FROM products WHERE LOWER(name) LIKE '%coca%';

-- FEFO batch selection (should use idx_batches_product_status_expiry)
EXPLAIN ANALYZE 
SELECT * FROM inventory_batches 
WHERE product_id = (SELECT id FROM products LIMIT 1)
  AND status = 'ACTIVE' 
  AND remaining_quantity > 0 
ORDER BY expiry_date ASC 
LIMIT 1;

-- Sales report by date (should use idx_sales_date_status)
EXPLAIN ANALYZE 
SELECT * FROM sales 
WHERE sale_date BETWEEN '2025-01-01' AND '2025-01-31' 
  AND status = 'COMPLETED' 
ORDER BY sale_date DESC;

-- Customer search (should use idx_customers_name_lower)
EXPLAIN ANALYZE 
SELECT * FROM customers 
WHERE LOWER(name) LIKE '%john%' 
  AND is_active = true;

-- Purchase order lookup (should use idx_po_order_number_upper)
EXPLAIN ANALYZE 
SELECT * FROM purchase_orders 
WHERE UPPER(order_number) = 'PO-2025-0001';
" -ForegroundColor White

Write-Host "`nFor detailed verification report, see: PRECISION_VERIFICATION_REPORT.md" -ForegroundColor Cyan
