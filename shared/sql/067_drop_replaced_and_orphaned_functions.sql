-- Migration 067: Drop all replaced and orphaned database functions
-- Architecture: Database is PASSIVE STORAGE ONLY — all business logic in service layer
--
-- KEPT (read-only report/query functions still actively called):
--   fn_get_accounting_periods, fn_get_period_status,
--   fn_get_profit_loss, fn_get_profit_loss_summary,
--   fn_get_profit_loss_by_customer, fn_get_profit_loss_by_product,
--   fn_reconcile_cash_account, fn_reconcile_accounts_receivable,
--   fn_reconcile_inventory, fn_reconcile_accounts_payable,
--   fn_full_reconciliation_report

BEGIN;

-- =========================================================================
-- 1. NUMBER GENERATORS (replaced by service-layer MAX+1 queries)
-- =========================================================================
DROP FUNCTION IF EXISTS generate_expense_number() CASCADE;
DROP FUNCTION IF EXISTS fn_generate_bank_txn_number() CASCADE;
DROP FUNCTION IF EXISTS fn_generate_statement_number() CASCADE;
DROP FUNCTION IF EXISTS fn_generate_cost_layer_txn_number() CASCADE;
DROP FUNCTION IF EXISTS fn_next_z_report_number() CASCADE;
DROP FUNCTION IF EXISTS fn_next_journal_entry_number() CASCADE;
DROP FUNCTION IF EXISTS generate_backup_number() CASCADE;
DROP FUNCTION IF EXISTS generate_reset_number() CASCADE;
DROP FUNCTION IF EXISTS generate_gr_number() CASCADE;
DROP FUNCTION IF EXISTS generate_invoice_number() CASCADE;
DROP FUNCTION IF EXISTS generate_payment_number() CASCADE;
DROP FUNCTION IF EXISTS generate_receipt_number() CASCADE;
DROP FUNCTION IF EXISTS generate_sale_number() CASCADE;
DROP FUNCTION IF EXISTS generate_transaction_number() CASCADE;
DROP FUNCTION IF EXISTS generate_ledger_transaction_number() CASCADE;

-- =========================================================================
-- 2. PERIOD MANAGEMENT (replaced by service-layer SQL in accountingPeriodService)
-- =========================================================================
DROP FUNCTION IF EXISTS fn_close_accounting_period(integer, integer, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS fn_reopen_accounting_period(integer, integer, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS fn_is_period_open(date) CASCADE;
DROP FUNCTION IF EXISTS trg_enforce_open_period_manual_je() CASCADE;

-- =========================================================================
-- 3. BALANCE RECALCULATION (replaced by service-layer SQL in admin/system repos)
-- =========================================================================
DROP FUNCTION IF EXISTS fn_recalculate_all_customer_balances() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_all_supplier_balances() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_all_product_stock() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_all_account_balances() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_all_balances() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_customer_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_customer_ar_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_supplier_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_supplier_ap_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_supplier_ap_balance(uuid, numeric) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_account_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_product_stock(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_sale_totals(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_po_totals(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_gr_totals(uuid) CASCADE;
DROP FUNCTION IF EXISTS recalc_all_customer_balances() CASCADE;

-- =========================================================================
-- 4. INTERNAL UPDATE/SYNC FUNCTIONS (orphaned trigger helpers)
-- =========================================================================
DROP FUNCTION IF EXISTS fn_update_customer_balance_internal() CASCADE;
DROP FUNCTION IF EXISTS fn_update_supplier_balance_internal() CASCADE;
DROP FUNCTION IF EXISTS fn_update_product_stock_internal() CASCADE;
DROP FUNCTION IF EXISTS fn_update_sale_totals_internal() CASCADE;
DROP FUNCTION IF EXISTS fn_update_po_totals_internal() CASCADE;
DROP FUNCTION IF EXISTS fn_update_gr_totals_internal() CASCADE;
DROP FUNCTION IF EXISTS fn_update_bank_balance() CASCADE;
DROP FUNCTION IF EXISTS sync_account_balance_on_ledger() CASCADE;
DROP FUNCTION IF EXISTS sync_invoice_payment_to_sales_and_customer() CASCADE;
DROP FUNCTION IF EXISTS sync_po_payment_amounts() CASCADE;
DROP FUNCTION IF EXISTS sync_supplier_balance_on_gr() CASCADE;
DROP FUNCTION IF EXISTS sync_supplier_balance_on_payment() CASCADE;
DROP FUNCTION IF EXISTS fn_sync_invoice_payment() CASCADE;
DROP FUNCTION IF EXISTS update_invoice_totals_after_payment() CASCADE;
DROP FUNCTION IF EXISTS update_outstanding_amount() CASCADE;
DROP FUNCTION IF EXISTS update_supplier_invoice_status() CASCADE;

-- =========================================================================
-- 5. GL POSTING (must be in service layer, not DB functions)
-- =========================================================================
DROP FUNCTION IF EXISTS fn_post_expense_to_gl(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_post_invoice_payment_to_ledger_manual(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_recover_missing_gl_postings() CASCADE;

-- =========================================================================
-- 6. ADMIN REPAIR/RESET (replaced by inline SQL in admin + system repos)
-- =========================================================================
DROP FUNCTION IF EXISTS fn_reset_accounting_complete() CASCADE;
DROP FUNCTION IF EXISTS fn_verify_post_reset_integrity() CASCADE;
DROP FUNCTION IF EXISTS fn_correct_account_balances() CASCADE;
DROP FUNCTION IF EXISTS fn_check_transaction_integrity() CASCADE;

-- =========================================================================
-- 7. AUTOMATION / MISC ORPHANED
-- =========================================================================
DROP FUNCTION IF EXISTS auto_expire_quotes() CASCADE;
DROP FUNCTION IF EXISTS expire_old_quotations() CASCADE;
DROP FUNCTION IF EXISTS check_ap_reconciliation() CASCADE;
DROP FUNCTION IF EXISTS check_ar_reconciliation() CASCADE;
DROP FUNCTION IF EXISTS check_expense_approval_required() CASCADE;
DROP FUNCTION IF EXISTS check_expense_approval_required(numeric, varchar) CASCADE;
DROP FUNCTION IF EXISTS fn_refresh_expense_summary() CASCADE;
DROP FUNCTION IF EXISTS fn_ledger_stock_balance(date) CASCADE;
DROP FUNCTION IF EXISTS fn_ledger_stock_balance(uuid) CASCADE;
DROP FUNCTION IF EXISTS validate_expense_status_transition(varchar, varchar, varchar) CASCADE;

-- =========================================================================
-- 8. TRIGGER-STYLE FUNCTIONS (no-arg versions used as trigger bodies)
-- =========================================================================
DROP FUNCTION IF EXISTS fn_recalculate_account_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_customer_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_gr_totals() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_po_totals() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_product_stock() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_sale_totals() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_supplier_ap_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_recalculate_supplier_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_update_customer_balance_internal(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_update_gr_totals_internal(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_update_po_totals_internal(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_update_product_stock_internal(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_update_sale_totals_internal(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_update_supplier_balance_internal(uuid) CASCADE;
DROP FUNCTION IF EXISTS fn_post_expense_to_gl(uuid, varchar) CASCADE;

-- =========================================================================
-- Record migration
-- =========================================================================
INSERT INTO schema_migrations (filename, executed_at)
VALUES ('067_drop_replaced_and_orphaned_functions.sql', NOW())
ON CONFLICT DO NOTHING;

-- =========================================================================
-- Drop generated columns (business logic computed inline in queries)
-- =========================================================================
ALTER TABLE products DROP COLUMN IF EXISTS is_service;
ALTER TABLE sale_items DROP COLUMN IF EXISTS is_service;
ALTER TABLE cash_register_reconciliations DROP COLUMN IF EXISTS variance_percent;

COMMIT;
