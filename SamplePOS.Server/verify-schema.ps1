# Database Schema Verification Script
# Verifies all required columns exist before starting the application
# Run this before starting the server to catch schema issues early

Write-Host "🔍 Verifying Database Schema..." -ForegroundColor Cyan

$DB_NAME = "pos_system"
$DB_USER = "postgres"

# Required columns for each table
$requiredColumns = @{
    "products" = @("id", "name", "sku", "barcode", "cost_price", "selling_price")
    "purchase_order_items" = @("id", "purchase_order_id", "product_id", "ordered_quantity", "received_quantity", "unit_price", "uom_id")
    "goods_receipt_items" = @("id", "goods_receipt_id", "product_id", "received_quantity", "cost_price", "po_item_id", "uom_id")
    "sales" = @("id", "sale_number", "customer_id", "sale_date", "total_amount", "created_at")
    "goods_receipts" = @("id", "receipt_number", "purchase_order_id", "status", "created_at")
    "inventory_batches" = @("id", "batch_number", "product_id", "remaining_quantity", "expiry_date")
    "stock_movements" = @("id", "movement_number", "product_id", "movement_type", "quantity", "reference_type", "reference_id", "created_at")
    "product_uoms" = @("id", "product_id", "uom_id", "conversion_factor", "is_default")
    "uoms" = @("id", "name", "symbol")
}

$errors = @()
$warnings = @()

foreach ($table in $requiredColumns.Keys) {
    Write-Host "  Checking table: $table" -ForegroundColor Yellow
    
    # Check if table exists
    $tableExists = psql -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = '$table');" 2>$null
    
    if ($tableExists -notmatch "t") {
        $errors += "❌ Table '$table' does not exist"
        continue
    }
    
    # Check required columns
    foreach ($column in $requiredColumns[$table]) {
        $columnExists = psql -U $DB_USER -d $DB_NAME -t -c "SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_name = '$table' AND column_name = '$column');" 2>$null
        
        if ($columnExists -notmatch "t") {
            $errors += "❌ Column '$table.$column' does not exist"
        }
    }
}

# Check for specific data integrity issues
Write-Host "`n  Checking data integrity..." -ForegroundColor Yellow

# 1. Check for NULL received_quantity in purchase_order_items
$nullReceivedQtyRaw = psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM purchase_order_items WHERE received_quantity IS NULL;" 2>$null
$nullReceivedQty = if ($nullReceivedQtyRaw) { ($nullReceivedQtyRaw | Select-Object -First 1).Trim() } else { '0' }
if ($nullReceivedQty -and [int]$nullReceivedQty -gt 0) {
    $warnings += "⚠️  $nullReceivedQty purchase order items have NULL received_quantity (should default to 0)"
}

# 2. Check for old-format batch numbers
$oldBatchesRaw = psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM inventory_batches WHERE batch_number LIKE 'BATCH-176%';" 2>$null
$oldBatches = if ($oldBatchesRaw) { ($oldBatchesRaw | Select-Object -First 1).Trim() } else { '0' }
if ($oldBatches -and [int]$oldBatches -gt 0) {
    $warnings += "⚠️  $oldBatches batches still use old timestamp format (BATCH-{timestamp}-{uuid})"
}

# 3. Check for products without product_uoms
$productsWithoutUomsRaw = psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM products p WHERE NOT EXISTS (SELECT 1 FROM product_uoms pu WHERE pu.product_id = p.id);" 2>$null
$productsWithoutUoms = if ($productsWithoutUomsRaw) { ($productsWithoutUomsRaw | Select-Object -First 1).Trim() } else { '0' }
if ($productsWithoutUoms -and [int]$productsWithoutUoms -gt 0) {
    $warnings += "⚠️  $productsWithoutUoms products don't have any UOMs configured"
}

# 4. Check for PENDING POs with completed GRs
$pendingWithGRRaw = psql -U $DB_USER -d $DB_NAME -t -c "SELECT COUNT(*) FROM purchase_orders po WHERE po.status = 'PENDING' AND EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.purchase_order_id = po.id AND gr.status = 'COMPLETED');" 2>$null
$pendingWithGR = if ($pendingWithGRRaw) { ($pendingWithGRRaw | Select-Object -First 1).Trim() } else { '0' }
if ($pendingWithGR -and [int]$pendingWithGR -gt 0) {
    $warnings += "⚠️  $pendingWithGR purchase orders are PENDING but have COMPLETED goods receipts"
}

# Print results
Write-Host "`n" -NoNewline
if ($errors.Count -eq 0) {
    Write-Host "✅ Schema verification passed!" -ForegroundColor Green
} else {
    Write-Host "❌ Schema verification FAILED!" -ForegroundColor Red
    Write-Host "`nErrors:" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  $error" -ForegroundColor Red
    }
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-Host "`nWarnings:" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  $warning" -ForegroundColor Yellow
    }
}

Write-Host "`n✅ Database is ready for use!" -ForegroundColor Green
exit 0
