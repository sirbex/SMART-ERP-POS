# PO/GR Health Check Script
# Run this to verify purchase order and goods receipt integrity
# Usage: .\check-po-gr-health.ps1

Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  PO/GR HEALTH CHECK - SamplePOS" -ForegroundColor Cyan
Write-Host "============================================================`n" -ForegroundColor Cyan

$ErrorCount = 0
$WarningCount = 0

# Check 1: Triggers Installed
Write-Host "[CHECK 1] Database Triggers" -ForegroundColor Yellow
$triggers = psql -U postgres -d pos_system -t -c "SELECT tgname FROM pg_trigger WHERE tgname IN ('trg_auto_populate_gr_po_item_id', 'trg_validate_gr_finalization');"
if ($triggers -match "trg_auto_populate_gr_po_item_id" -and $triggers -match "trg_validate_gr_finalization") {
    Write-Host "   ✅ Both protection triggers are active" -ForegroundColor Green
} else {
    Write-Host "   ❌ Missing triggers! Run migration scripts 016 and 017" -ForegroundColor Red
    $ErrorCount++
}

# Check 2: Missing po_item_id Links
Write-Host "`n[CHECK 2] Missing po_item_id Links" -ForegroundColor Yellow
$missing = psql -U postgres -d pos_system -t -c "SELECT COUNT(*) FROM goods_receipt_items gri JOIN goods_receipts gr ON gri.goods_receipt_id = gr.id WHERE gri.po_item_id IS NULL AND gr.purchase_order_id IS NOT NULL AND gri.received_quantity > 0;"
$missingCount = [int]$missing.Trim()
if ($missingCount -eq 0) {
    Write-Host "   ✅ All GR items properly linked to PO items" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  $missingCount GR items missing po_item_id links" -ForegroundColor Yellow
    $WarningCount++
    Write-Host "      Run auto-fix: UPDATE goods_receipt_items SET po_item_id = (SELECT poi.id FROM purchase_order_items poi JOIN goods_receipts gr ON poi.purchase_order_id = gr.purchase_order_id WHERE poi.product_id = goods_receipt_items.product_id AND gr.id = goods_receipt_items.goods_receipt_id LIMIT 1) WHERE po_item_id IS NULL;" -ForegroundColor Gray
}

# Check 3: PO Status Consistency
Write-Host "`n[CHECK 3] PO Status Consistency" -ForegroundColor Yellow
$inconsistent = psql -U postgres -d pos_system -t -c "SELECT po.order_number, po.status, COUNT(*) FILTER (WHERE poi.ordered_quantity > poi.received_quantity) as pending FROM purchase_orders po JOIN purchase_order_items poi ON poi.purchase_order_id = po.id WHERE po.status != 'DRAFT' GROUP BY po.id, po.order_number, po.status HAVING (po.status = 'COMPLETED' AND COUNT(*) FILTER (WHERE poi.ordered_quantity > poi.received_quantity) > 0) OR (po.status = 'PENDING' AND COUNT(*) FILTER (WHERE poi.ordered_quantity > poi.received_quantity) = 0);"
if ([string]::IsNullOrWhiteSpace($inconsistent)) {
    Write-Host "   ✅ All PO statuses are consistent" -ForegroundColor Green
} else {
    Write-Host "   ❌ Inconsistent PO statuses found:" -ForegroundColor Red
    Write-Host $inconsistent -ForegroundColor Gray
    $ErrorCount++
}

# Check 4: Completed GRs without Batches
Write-Host "`n[CHECK 4] Completed GRs without Inventory Batches" -ForegroundColor Yellow
$nobatches = psql -U postgres -d pos_system -t -c "SELECT gr.receipt_number FROM goods_receipts gr LEFT JOIN inventory_batches ib ON ib.goods_receipt_id = gr.id WHERE gr.status = 'COMPLETED' AND ib.id IS NULL;"
if ([string]::IsNullOrWhiteSpace($nobatches)) {
    Write-Host "   ✅ All completed GRs have inventory batches" -ForegroundColor Green
} else {
    Write-Host "   ❌ Completed GRs without batches:" -ForegroundColor Red
    Write-Host $nobatches -ForegroundColor Gray
    $ErrorCount++
}

# Check 5: GR Items with Zero Quantity in Completed GRs
Write-Host "`n[CHECK 5] Zero Quantity Items in Completed GRs" -ForegroundColor Yellow
$zeros = psql -U postgres -d pos_system -t -c "SELECT gr.receipt_number, COUNT(*) FROM goods_receipts gr JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id WHERE gr.status = 'COMPLETED' AND gri.received_quantity = 0 GROUP BY gr.receipt_number;"
if ([string]::IsNullOrWhiteSpace($zeros)) {
    Write-Host "   ✅ No zero-quantity items in completed GRs" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Completed GRs with zero quantities:" -ForegroundColor Yellow
    Write-Host $zeros -ForegroundColor Gray
    $WarningCount++
}

# Check 6: Draft GRs Summary
Write-Host "`n[CHECK 6] Draft GRs (Awaiting Finalization)" -ForegroundColor Yellow
$drafts = psql -U postgres -d pos_system -t -c "SELECT receipt_number FROM goods_receipts WHERE status = 'DRAFT';"
if ([string]::IsNullOrWhiteSpace($drafts)) {
    Write-Host "   ✅ No draft GRs pending finalization" -ForegroundColor Green
} else {
    Write-Host "   ℹ️  Draft GRs:" -ForegroundColor Cyan
    $draftArray = $drafts -split "`n" | Where-Object { $_.Trim() -ne "" }
    foreach ($draft in $draftArray) {
        Write-Host "      - $($draft.Trim())" -ForegroundColor Gray
    }
}

# Summary
Write-Host "`n============================================================" -ForegroundColor Cyan
Write-Host "  SUMMARY" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

if ($ErrorCount -eq 0 -and $WarningCount -eq 0) {
    Write-Host "✅ ALL CHECKS PASSED - System is healthy!" -ForegroundColor Green
} elseif ($ErrorCount -eq 0) {
    Write-Host "⚠️  $WarningCount warnings found (non-critical)" -ForegroundColor Yellow
} else {
    Write-Host "❌ $ErrorCount errors, $WarningCount warnings" -ForegroundColor Red
    Write-Host "`nRecommendation: Fix errors immediately to ensure data integrity" -ForegroundColor Yellow
}

Write-Host ""
