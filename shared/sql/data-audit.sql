-- COMPREHENSIVE DATA AUDIT
-- Check all data sources for inconsistencies

\echo '=== INVENTORY DATA ==='
SELECT 'products' as entity, COUNT(*) as count, COALESCE(SUM(quantity_on_hand), 0) as total FROM products;
SELECT 'inventory_batches' as entity, COUNT(*) as count, COALESCE(SUM(remaining_quantity), 0) as total FROM inventory_batches;
SELECT 'cost_layers' as entity, COUNT(*) as count, COALESCE(SUM(remaining_quantity), 0) as total FROM cost_layers;
SELECT 'stock_movements' as entity, COUNT(*) as count, COALESCE(SUM(quantity), 0) as total FROM stock_movements;

\echo '=== PROCUREMENT DATA ==='
SELECT 'purchase_orders' as entity, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM purchase_orders;
SELECT 'purchase_order_items' as entity, COUNT(*) as count, COALESCE(SUM(ordered_quantity), 0) as total FROM purchase_order_items;
SELECT 'goods_receipts' as entity, COUNT(*) as count, COALESCE(SUM(total_value), 0) as total FROM goods_receipts;
SELECT 'goods_receipt_items' as entity, COUNT(*) as count, COALESCE(SUM(received_quantity), 0) as total FROM goods_receipt_items;

\echo '=== SUPPLIER DATA ==='
SELECT 'suppliers' as entity, COUNT(*) as count, COALESCE(SUM("OutstandingBalance"), 0) as total FROM suppliers;
SELECT 'supplier_invoices' as entity, COUNT(*) as count, COALESCE(SUM("OutstandingBalance"), 0) as total FROM supplier_invoices;
SELECT 'supplier_payments' as entity, COUNT(*) as count, COALESCE(SUM("Amount"), 0) as total FROM supplier_payments;

\echo '=== ACCOUNTING DATA ==='
SELECT 'accounts' as entity, COUNT(*) as count, COALESCE(SUM("CurrentBalance"), 0) as total FROM accounts;
SELECT 'journal_entries' as entity, COUNT(*) as count, 0 as total FROM journal_entries;
SELECT 'journal_lines' as entity, COUNT(*) as count, COALESCE(SUM("DebitAmount"), 0) as total FROM journal_lines;

\echo '=== SALES DATA ==='
SELECT 'sales' as entity, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM sales;
SELECT 'sale_items' as entity, COUNT(*) as count, COALESCE(SUM(quantity), 0) as total FROM sale_items;

\echo '=== ORPHANED DATA CHECK ==='
-- Inventory batches without matching goods receipts
SELECT 'orphan_batches' as issue, COUNT(*) as count 
FROM inventory_batches ib 
LEFT JOIN goods_receipt_items gri ON gri.id = ib.goods_receipt_item_id 
WHERE gri.id IS NULL AND ib.goods_receipt_item_id IS NOT NULL;

-- Stock movements without source
SELECT 'orphan_stock_movements' as issue, COUNT(*) as count
FROM stock_movements sm
WHERE reference_type = 'GOODS_RECEIPT' 
AND NOT EXISTS (SELECT 1 FROM goods_receipts gr WHERE gr.id::text = sm.reference_id);

\echo '=== DETAILED ORPHANED INVENTORY BATCHES ==='
SELECT ib.id, ib.product_id, p.name as product_name, ib.batch_number, ib.remaining_quantity, ib.goods_receipt_item_id
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
WHERE ib.remaining_quantity > 0;

\echo '=== DETAILED STOCK MOVEMENTS ==='
SELECT sm.id, sm.product_id, p.name as product_name, sm.movement_type, sm.quantity, sm.reference_type, sm.reference_id
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id;
