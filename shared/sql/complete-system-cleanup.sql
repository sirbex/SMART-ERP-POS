-- =============================================================================
-- COMPLETE SYSTEM CLEANUP - Fix ALL orphaned data
-- This script ensures data integrity across ALL related tables
-- =============================================================================

BEGIN;

\echo '============================================='
\echo 'PHASE 1: CLEAR ALL INVENTORY/STOCK DATA'
\echo '============================================='

-- Clear orphaned inventory batches
DELETE FROM inventory_batches;
\echo 'Cleared: inventory_batches'

-- Clear orphaned stock movements
DELETE FROM stock_movements;
\echo 'Cleared: stock_movements'

-- Clear cost layers
DELETE FROM cost_layers;
\echo 'Cleared: cost_layers'

-- Clear stock counts
DELETE FROM stock_count_lines WHERE EXISTS (SELECT 1 FROM stock_count_lines LIMIT 1);
DELETE FROM stock_counts WHERE EXISTS (SELECT 1 FROM stock_counts LIMIT 1);
\echo 'Cleared: stock_counts, stock_count_lines'

\echo '============================================='
\echo 'PHASE 2: RESET ALL PRODUCT QUANTITIES TO 0'
\echo '============================================='

UPDATE products SET quantity_on_hand = 0, updated_at = NOW() WHERE quantity_on_hand != 0;
\echo 'Reset: products.quantity_on_hand = 0'

\echo '============================================='
\echo 'PHASE 3: RESET ALL ACCOUNT BALANCES TO 0'
\echo '============================================='

-- Reset GL account balances (accounts uses PascalCase)
UPDATE accounts SET "CurrentBalance" = 0 WHERE "CurrentBalance" != 0;
\echo 'Reset: accounts.CurrentBalance = 0'

\echo '============================================='
\echo 'PHASE 4: CLEAR ALL PURCHASE ORDER DATA'
\echo '============================================='

DELETE FROM goods_receipt_items WHERE EXISTS (SELECT 1 FROM goods_receipt_items LIMIT 1);
DELETE FROM goods_receipts WHERE EXISTS (SELECT 1 FROM goods_receipts LIMIT 1);
DELETE FROM purchase_order_items WHERE EXISTS (SELECT 1 FROM purchase_order_items LIMIT 1);
DELETE FROM purchase_orders WHERE EXISTS (SELECT 1 FROM purchase_orders LIMIT 1);
\echo 'Cleared: goods_receipts, purchase_orders and items'

\echo '============================================='
\echo 'PHASE 5: CLEAR ALL SUPPLIER DATA'
\echo '============================================='

DELETE FROM supplier_payment_allocations WHERE EXISTS (SELECT 1 FROM supplier_payment_allocations LIMIT 1);
DELETE FROM supplier_payments WHERE EXISTS (SELECT 1 FROM supplier_payments LIMIT 1);
DELETE FROM supplier_invoice_line_items WHERE EXISTS (SELECT 1 FROM supplier_invoice_line_items LIMIT 1);
DELETE FROM supplier_invoices WHERE EXISTS (SELECT 1 FROM supplier_invoices LIMIT 1);
\echo 'Cleared: supplier_invoices, supplier_payments'

-- Reset supplier balances
UPDATE suppliers SET "OutstandingBalance" = 0, "UpdatedAt" = NOW() WHERE "OutstandingBalance" != 0;
\echo 'Reset: suppliers.OutstandingBalance = 0'

\echo '============================================='
\echo 'PHASE 6: CLEAR ALL SALES DATA'
\echo '============================================='

DELETE FROM sale_discounts WHERE EXISTS (SELECT 1 FROM sale_discounts LIMIT 1);
DELETE FROM sale_items WHERE EXISTS (SELECT 1 FROM sale_items LIMIT 1);
DELETE FROM sales WHERE EXISTS (SELECT 1 FROM sales LIMIT 1);
\echo 'Cleared: sales, sale_items, sale_discounts'

-- Reset customer balances
UPDATE customers SET balance = 0, updated_at = NOW() WHERE balance != 0;
\echo 'Reset: customers.balance = 0'

\echo '============================================='
\echo 'PHASE 7: CLEAR ALL INVOICE DATA'
\echo '============================================='

DELETE FROM invoice_payments WHERE EXISTS (SELECT 1 FROM invoice_payments LIMIT 1);
DELETE FROM invoice_line_items WHERE EXISTS (SELECT 1 FROM invoice_line_items LIMIT 1);
DELETE FROM invoices WHERE EXISTS (SELECT 1 FROM invoices LIMIT 1);
\echo 'Cleared: invoices, invoice_line_items, invoice_payments'

\echo '============================================='
\echo 'PHASE 8: CLEAR ALL CUSTOMER PAYMENTS/DEPOSITS'
\echo '============================================='

DELETE FROM credit_applications WHERE EXISTS (SELECT 1 FROM credit_applications LIMIT 1);
DELETE FROM deposit_applications WHERE EXISTS (SELECT 1 FROM deposit_applications LIMIT 1);
DELETE FROM pos_deposit_applications WHERE EXISTS (SELECT 1 FROM pos_deposit_applications LIMIT 1);
DELETE FROM customer_deposits WHERE EXISTS (SELECT 1 FROM customer_deposits LIMIT 1);
DELETE FROM pos_customer_deposits WHERE EXISTS (SELECT 1 FROM pos_customer_deposits LIMIT 1);
DELETE FROM customer_payments WHERE EXISTS (SELECT 1 FROM customer_payments LIMIT 1);
DELETE FROM customer_credits WHERE EXISTS (SELECT 1 FROM customer_credits LIMIT 1);
DELETE FROM customer_balance_adjustments WHERE EXISTS (SELECT 1 FROM customer_balance_adjustments LIMIT 1);
\echo 'Cleared: customer payments and deposits'

\echo '============================================='
\echo 'PHASE 9: CLEAR ALL ACCOUNTING/JOURNAL DATA'
\echo '============================================='

DELETE FROM ledger_entries WHERE EXISTS (SELECT 1 FROM ledger_entries LIMIT 1);
DELETE FROM ledger_transactions WHERE EXISTS (SELECT 1 FROM ledger_transactions LIMIT 1);
DELETE FROM journal_entry_lines WHERE EXISTS (SELECT 1 FROM journal_entry_lines LIMIT 1);
DELETE FROM journal_entries WHERE EXISTS (SELECT 1 FROM journal_entries LIMIT 1);
\echo 'Cleared: journal_entries, ledger_entries'

\echo '============================================='
\echo 'PHASE 10: CLEAR QUOTATIONS AND EXPENSES'
\echo '============================================='

DELETE FROM quotation_items WHERE EXISTS (SELECT 1 FROM quotation_items LIMIT 1);
DELETE FROM quotations WHERE EXISTS (SELECT 1 FROM quotations LIMIT 1);
DELETE FROM expense_approvals WHERE EXISTS (SELECT 1 FROM expense_approvals LIMIT 1);
DELETE FROM expense_documents WHERE EXISTS (SELECT 1 FROM expense_documents LIMIT 1);
DELETE FROM expenses WHERE EXISTS (SELECT 1 FROM expenses LIMIT 1);
\echo 'Cleared: quotations, expenses'

COMMIT;

\echo ''
\echo '============================================='
\echo 'DATA INTEGRITY VERIFICATION'
\echo '============================================='

-- Verify clean state
SELECT 'VERIFICATION' as check_type;
SELECT 'inventory_batches' as entity, COUNT(*) as count FROM inventory_batches
UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
UNION ALL SELECT 'cost_layers', COUNT(*) FROM cost_layers
UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
UNION ALL SELECT 'goods_receipts', COUNT(*) FROM goods_receipts
UNION ALL SELECT 'supplier_invoices', COUNT(*) FROM supplier_invoices
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
UNION ALL SELECT 'journal_entries', COUNT(*) FROM journal_entries
ORDER BY entity;

\echo ''
\echo 'BALANCE VERIFICATION (should all be 0)'
SELECT 'products_qty' as entity, COALESCE(SUM(quantity_on_hand), 0) as total FROM products
UNION ALL SELECT 'customer_balance', COALESCE(SUM(balance), 0) FROM customers
UNION ALL SELECT 'supplier_balance', COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers
UNION ALL SELECT 'account_balance', COALESCE(SUM("CurrentBalance"), 0) FROM accounts;

\echo ''
\echo '✅ COMPLETE SYSTEM CLEANUP FINISHED'
\echo '============================================='
