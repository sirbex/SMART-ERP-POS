-- =============================================================================
-- SAFE DATA RESET - Bulletproof system data cleanup
-- =============================================================================
-- This script safely resets ALL transactional data while preserving:
-- - Master data (products, customers, suppliers, users, accounts, etc.)
-- - System settings and configuration
-- - Delivery routes (configuration data)
--
-- It handles ALL foreign key dependencies in the correct order.
-- =============================================================================

-- Disable all triggers during reset to prevent cascade errors
SET session_replication_role = replica;

BEGIN;

-- =============================================================================
-- PHASE 1: DELIVERY AND ROUTE DATA (depends on sales/invoices)
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 1: Clearing delivery data...'; END $$;

DELETE FROM delivery_proof WHERE TRUE;
DELETE FROM delivery_status_history WHERE TRUE;
DELETE FROM delivery_items WHERE TRUE;
DELETE FROM route_deliveries WHERE TRUE;
DELETE FROM delivery_orders WHERE TRUE;
-- Note: delivery_routes is configuration data - preserve it

-- =============================================================================
-- PHASE 2: CUSTOMER FINANCIAL DATA (depends on invoices/sales)
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 2: Clearing customer financial data...'; END $$;

DELETE FROM credit_applications WHERE TRUE;
DELETE FROM deposit_applications WHERE TRUE;
DELETE FROM pos_deposit_applications WHERE TRUE;
DELETE FROM customer_deposits WHERE TRUE;
DELETE FROM pos_customer_deposits WHERE TRUE;
DELETE FROM customer_payments WHERE TRUE;
DELETE FROM customer_credits WHERE TRUE;
DELETE FROM customer_balance_adjustments WHERE TRUE;
DELETE FROM customer_balance_audit WHERE TRUE;

-- =============================================================================
-- PHASE 3: INVOICE DATA (depends on sales, payments)
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 3: Clearing invoice data...'; END $$;

DELETE FROM invoice_payments WHERE TRUE;
DELETE FROM invoice_line_items WHERE TRUE;
DELETE FROM invoices WHERE TRUE;

-- =============================================================================
-- PHASE 4: SALES DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 4: Clearing sales data...'; END $$;

DELETE FROM sale_discounts WHERE TRUE;
DELETE FROM payment_lines WHERE TRUE;
DELETE FROM payment_allocations WHERE TRUE;
DELETE FROM sale_items WHERE TRUE;
DELETE FROM sales WHERE TRUE;

-- =============================================================================
-- PHASE 5: POS HELD ORDERS
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 5: Clearing POS held orders...'; END $$;

DELETE FROM pos_held_order_items WHERE TRUE;
DELETE FROM pos_held_orders WHERE TRUE;

-- =============================================================================
-- PHASE 6: QUOTATION DATA (must be after sales due to converted_to_sale_id)
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 6: Clearing quotation data...'; END $$;

DELETE FROM quotation_attachments WHERE TRUE;
DELETE FROM quotation_emails WHERE TRUE;
DELETE FROM quotation_status_history WHERE TRUE;
DELETE FROM quotation_items WHERE TRUE;
DELETE FROM quotations WHERE TRUE;

-- =============================================================================
-- PHASE 7: SUPPLIER FINANCIAL DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 7: Clearing supplier financial data...'; END $$;

DELETE FROM supplier_payment_allocations WHERE TRUE;
DELETE FROM supplier_payments WHERE TRUE;
DELETE FROM supplier_invoice_line_items WHERE TRUE;
DELETE FROM supplier_invoices WHERE TRUE;

-- =============================================================================
-- PHASE 8: PURCHASE ORDER DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 8: Clearing purchase order data...'; END $$;

DELETE FROM goods_receipt_items WHERE TRUE;
DELETE FROM goods_receipts WHERE TRUE;
DELETE FROM purchase_order_items WHERE TRUE;
DELETE FROM purchase_orders WHERE TRUE;

-- =============================================================================
-- PHASE 9: INVENTORY DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 9: Clearing inventory data...'; END $$;

DELETE FROM stock_count_lines WHERE TRUE;
DELETE FROM stock_counts WHERE TRUE;
DELETE FROM stock_movements WHERE TRUE;
DELETE FROM inventory_batches WHERE TRUE;
DELETE FROM cost_layers WHERE TRUE;
DELETE FROM inventory_snapshots WHERE TRUE;

-- Vertical partition tables (migration 410) — must be cleared
-- so stale prices/quantities don't interfere with import
DELETE FROM product_valuation WHERE TRUE;
DELETE FROM product_inventory WHERE TRUE;

-- =============================================================================
-- PHASE 10: EXPENSE DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 10: Clearing expense data...'; END $$;

DELETE FROM expense_approvals WHERE TRUE;
DELETE FROM expense_documents WHERE TRUE;
DELETE FROM expenses WHERE TRUE;

-- =============================================================================
-- PHASE 11: BANKING DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 11: Clearing banking data...'; END $$;

DELETE FROM bank_reconciliation_items WHERE TRUE;
DELETE FROM bank_reconciliations WHERE TRUE;
DELETE FROM bank_statement_lines WHERE TRUE;
DELETE FROM bank_statements WHERE TRUE;
DELETE FROM bank_transactions WHERE TRUE;
DELETE FROM cash_bank_transfers WHERE TRUE;
DELETE FROM cash_book_entries WHERE TRUE;
-- Preserve: bank_accounts, bank_categories, bank_patterns, bank_templates, bank_alerts, bank_recurring_rules

-- =============================================================================
-- PHASE 11B: CASH REGISTER DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 11B: Clearing cash register data...'; END $$;

-- Cash movements must be deleted first (references sessions)
DELETE FROM cash_movements WHERE TRUE;

-- Cash register sessions (transactional data)
DELETE FROM cash_register_sessions WHERE TRUE;

-- Preserve: cash_registers (they are configuration/physical register records)

-- =============================================================================
-- PHASE 12: ACCOUNTING/LEDGER DATA
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 12: Clearing accounting data...'; END $$;

DELETE FROM ledger_entries WHERE TRUE;
DELETE FROM ledger_transactions WHERE TRUE;
DELETE FROM manual_journal_entry_lines WHERE TRUE;
DELETE FROM manual_journal_entries WHERE TRUE;
DELETE FROM journal_entry_lines WHERE TRUE;
DELETE FROM journal_entries WHERE TRUE;

-- =============================================================================
-- PHASE 13: PAYMENT TRANSACTIONS
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 13: Clearing payment transactions...'; END $$;

DELETE FROM payment_transactions WHERE TRUE;
DELETE FROM failed_transactions WHERE TRUE;
DELETE FROM processed_events WHERE TRUE;

-- =============================================================================
-- PHASE 14: DISCOUNT AUTHORIZATIONS
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 14: Clearing discount authorizations...'; END $$;

DELETE FROM discount_authorizations WHERE TRUE;

-- =============================================================================
-- PHASE 15: AUDIT/LOG DATA (optional - comment out to preserve)
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 15: Clearing audit log...'; END $$;

DELETE FROM audit_log WHERE TRUE;
DELETE FROM data_integrity_log WHERE TRUE;
DELETE FROM report_runs WHERE TRUE;

-- =============================================================================
-- PHASE 16: RESET ALL BALANCES TO ZERO
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 16: Resetting all balances...'; END $$;

-- Reset product quantities
UPDATE products SET quantity_on_hand = 0, updated_at = NOW();

-- Recreate child table rows that Phase 9 deleted.
-- trg_product_create_children only fires on INSERT, not UPDATE,
-- so existing products need explicit child row creation here.
INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level)
SELECT p.id, 0, COALESCE(p.reorder_level, 0)
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_inventory pi WHERE pi.product_id = p.id)
ON CONFLICT (product_id) DO NOTHING;

INSERT INTO product_valuation (
  product_id, cost_price, selling_price, average_cost, last_cost,
  costing_method, pricing_formula, auto_update_price
)
SELECT p.id,
  COALESCE(p.cost_price, 0), COALESCE(p.selling_price, 0),
  COALESCE(p.cost_price, 0), COALESCE(p.cost_price, 0),
  COALESCE(p.costing_method, 'FIFO'), p.pricing_formula,
  COALESCE(p.auto_update_price, false)
FROM products p
WHERE NOT EXISTS (SELECT 1 FROM product_valuation pv WHERE pv.product_id = p.id)
ON CONFLICT (product_id) DO NOTHING;

-- Reset customer balances
UPDATE customers SET balance = 0, updated_at = NOW();

-- Reset supplier balances (PascalCase columns)
UPDATE suppliers SET "OutstandingBalance" = 0, "UpdatedAt" = NOW();

-- Reset GL account balances (PascalCase columns)
UPDATE accounts SET "CurrentBalance" = 0;

-- Reset bank account balances
UPDATE bank_accounts SET current_balance = 0, updated_at = NOW();

-- =============================================================================
-- PHASE 17: RESET SEQUENCES (for number generation)
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 17: Resetting sequences...'; END $$;

-- Reset any sequences that exist for document numbering
-- EXCLUDES master-data sequences (product_number_seq, customer_number_seq, etc.)
-- because master data rows are preserved and their numbers must not collide.
DO $$
DECLARE
    seq_record RECORD;
    -- Sequences tied to preserved master data — must NOT be reset
    master_data_seqs TEXT[] := ARRAY[
        'product_number_seq',
        'customer_number_seq',
        'supplier_number_seq',
        'account_number_seq'
    ];
BEGIN
    FOR seq_record IN 
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
          AND sequence_name != ALL(master_data_seqs)
    LOOP
        EXECUTE format('ALTER SEQUENCE %I RESTART WITH 1', seq_record.sequence_name);
    END LOOP;
END $$;

-- =============================================================================
-- PHASE 18: RESET ACCOUNTING PERIODS
-- =============================================================================
DO $$ BEGIN RAISE NOTICE 'PHASE 18: Resetting accounting periods...'; END $$;

-- Reset accounting period history if it has transactions
DELETE FROM accounting_period_history WHERE TRUE;

-- Reset accounting periods to open state
UPDATE accounting_periods 
SET status = 'OPEN', 
    closed_at = NULL,
    closed_by = NULL
WHERE status = 'CLOSED';

COMMIT;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================
DO $$ BEGIN RAISE NOTICE ''; END $$;
DO $$ BEGIN RAISE NOTICE '=============================================='; END $$;
DO $$ BEGIN RAISE NOTICE 'SAFE DATA RESET COMPLETED SUCCESSFULLY'; END $$;
DO $$ BEGIN RAISE NOTICE '=============================================='; END $$;

-- Verify all transactional tables are empty
SELECT 'TRANSACTION DATA VERIFICATION' as check_type;

SELECT entity, count FROM (
    SELECT 'sales' as entity, COUNT(*) as count FROM sales
    UNION ALL SELECT 'sale_items', COUNT(*) FROM sale_items
    UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
    UNION ALL SELECT 'invoice_payments', COUNT(*) FROM invoice_payments
    UNION ALL SELECT 'quotations', COUNT(*) FROM quotations
    UNION ALL SELECT 'purchase_orders', COUNT(*) FROM purchase_orders
    UNION ALL SELECT 'goods_receipts', COUNT(*) FROM goods_receipts
    UNION ALL SELECT 'supplier_invoices', COUNT(*) FROM supplier_invoices
    UNION ALL SELECT 'inventory_batches', COUNT(*) FROM inventory_batches
    UNION ALL SELECT 'stock_movements', COUNT(*) FROM stock_movements
    UNION ALL SELECT 'ledger_transactions', COUNT(*) FROM ledger_transactions
    UNION ALL SELECT 'journal_entries', COUNT(*) FROM journal_entries
    UNION ALL SELECT 'customer_payments', COUNT(*) FROM customer_payments
    UNION ALL SELECT 'delivery_orders', COUNT(*) FROM delivery_orders
    UNION ALL SELECT 'cash_register_sessions', COUNT(*) FROM cash_register_sessions
    UNION ALL SELECT 'cash_movements', COUNT(*) FROM cash_movements
) counts
ORDER BY entity;

-- Verify all balances are zero
SELECT 'BALANCE VERIFICATION (all should be 0)' as check_type;

SELECT entity, total::numeric(15,2) FROM (
    SELECT 'products.quantity_on_hand' as entity, COALESCE(SUM(quantity_on_hand), 0) as total FROM products
    UNION ALL SELECT 'customers.balance', COALESCE(SUM(balance), 0) FROM customers
    UNION ALL SELECT 'suppliers.OutstandingBalance', COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers
    UNION ALL SELECT 'accounts.CurrentBalance', COALESCE(SUM("CurrentBalance"), 0) FROM accounts
) balances;

-- Verify master data is preserved
SELECT 'MASTER DATA VERIFICATION (should have data)' as check_type;

SELECT entity, count FROM (
    SELECT 'products' as entity, COUNT(*) as count FROM products
    UNION ALL SELECT 'customers', COUNT(*) FROM customers
    UNION ALL SELECT 'suppliers', COUNT(*) FROM suppliers
    UNION ALL SELECT 'accounts', COUNT(*) FROM accounts
    UNION ALL SELECT 'users', COUNT(*) FROM users
    UNION ALL SELECT 'uoms', COUNT(*) FROM uoms
    UNION ALL SELECT 'expense_categories', COUNT(*) FROM expense_categories
    UNION ALL SELECT 'cash_registers', COUNT(*) FROM cash_registers
) master_data
ORDER BY entity;

DO $$ BEGIN RAISE NOTICE ''; END $$;
DO $$ BEGIN RAISE NOTICE '✅ DATA RESET COMPLETE - System is ready for fresh transactions'; END $$;
