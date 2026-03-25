-- ============================================================================
-- MIGRATION 253: Disable Business-Logic Triggers (Reversible)
-- 
-- ARCHITECTURE ALIGNMENT: Move from trigger-driven balance management to
-- application-layer posting pipeline. Follows enterprise ERP patterns:
--   - SAP B1: "Posting Document" — all side-effects in service transaction
--   - Odoo: "Compute Fields" — balances derived from source data
--   - Tally: "Voucher Pipeline" — fail-fast financial operations
--
-- WHAT THIS DISABLES (18 business-logic triggers):
--   A. Supplier balance sync (3 triggers)
--   B. Customer balance sync (4 triggers)
--   C. Supplier invoice/payment sync (3 triggers)
--   D. GL/Account balance sync (2 triggers)
--   E. PO payment tracking (2 triggers)
--   F. Transaction logic (4 triggers)
--
-- WHAT STAYS ENABLED:
--   - ~18 timestamp triggers (updated_at maintenance)
--   - ~6 business ID generation triggers (SALE-YYYY-####, DEP-YYYY-####, etc.)
--   - ~7 period enforcement triggers (financial period locking)
--   - All validation/constraint triggers (balance checks, inventory guards)
--   - All audit logging triggers
--
-- APP-LAYER REPLACEMENTS (in SamplePOS.Server):
--   - Supplier balance: supplierRepository.recalculateOutstandingBalance()
--   - Customer balance: invoiceService BR-INV-003 recalculation (already exists)
--   - Account balance: AccountingCore.createJournalEntry() L496-507 (already exists)
--   - Invoice paid amounts: supplierPaymentRepository.updateInvoicePaidAmount()
--   - Deposit status: depositsRepository computed in applyDepositToSaleInTransaction()
--   - Sale item product_type: salesRepository lookup before INSERT
--
-- REVERSIBLE: Re-enable with ALTER TABLE ... ENABLE TRIGGER ...
-- Date: 2026-03-25
-- ============================================================================

BEGIN;

-- ============================================================================
-- Helper: Disable trigger only if it exists (avoids ERROR on missing triggers)
-- ============================================================================
CREATE OR REPLACE FUNCTION _disable_trigger_if_exists(p_table TEXT, p_trigger TEXT)
RETURNS VOID AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger t
        JOIN pg_class c ON t.tgrelid = c.oid
        WHERE c.relname = p_table AND t.tgname = p_trigger
    ) THEN
        EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', p_table, p_trigger);
        RAISE NOTICE 'DISABLED: %.%', p_table, p_trigger;
    ELSE
        RAISE NOTICE 'SKIPPED (not found): %.%', p_table, p_trigger;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- A. Supplier Balance Sync (3 triggers)
-- Replaced by: supplierRepository.recalculateOutstandingBalance()
-- Called from: goodsReceiptService.finalizeGR(), supplierPaymentService.*
-- ============================================================================

-- A1. Recalculates supplier balance when GR items change
SELECT _disable_trigger_if_exists('goods_receipt_items', 'trg_sync_supplier_balance_on_gr');

-- A2. Recalculates supplier balance when supplier payment changes
SELECT _disable_trigger_if_exists('supplier_payments', 'trg_sync_supplier_balance_on_payment');

-- A3. Recalculates supplier balance when GR status changes to COMPLETED
SELECT _disable_trigger_if_exists('goods_receipts', 'trg_sync_supplier_on_gr_complete');


-- ============================================================================
-- B. Customer Balance Sync (4 triggers)
-- Replaced by: invoiceService.addPayment() BR-INV-003 recalculation
-- Already implemented at invoiceService L641-656
-- ============================================================================

-- B1. Recalculates customer AR balance on invoice create/update/delete
SELECT _disable_trigger_if_exists('invoices', 'trg_sync_customer_on_invoice');

-- B2. Syncs invoice paid amounts when invoice_payments change
SELECT _disable_trigger_if_exists('invoice_payments', 'trg_invoice_payment_sync');

-- B3. Duplicate of B1 — customer balance sync on invoice change
SELECT _disable_trigger_if_exists('invoices', 'trg_sync_invoice_to_customer');

-- B4. Warning-only trigger on direct customer.balance modification (no business value)
SELECT _disable_trigger_if_exists('customers', 'trg_protect_customer_balance');


-- ============================================================================
-- C. Supplier Invoice/Payment Sync (3 triggers)
-- Replaced by: supplierPaymentService allocation + updateInvoicePaidAmount()
-- ============================================================================

-- C1. Recalculates supplier balance when supplier_invoices change
SELECT _disable_trigger_if_exists('supplier_invoices', 'trg_sync_supplier_on_invoice');

-- C2. Syncs invoice status when payment allocations change
SELECT _disable_trigger_if_exists('supplier_payment_allocations', 'trg_supplier_payment_allocation_sync');

-- C3. Duplicate supplier balance recalc on payment (same as A2 but different function)
SELECT _disable_trigger_if_exists('supplier_payments', 'trg_sync_supplier_on_payment');


-- ============================================================================
-- D. GL/Account Balance Sync (2 triggers)
-- trg_sync_account_balance_on_ledger: REDUNDANT — AccountingCore.createJournalEntry()
--   already updates accounts.CurrentBalance at L496-507 within the same transaction.
-- trg_sync_customer_to_ar: AR balance comes from GL, not customer table.
-- ============================================================================

-- D1. Maintains accounts.CurrentBalance on ledger_entries INSERT/UPDATE/DELETE
-- REDUNDANT: AccountingCore already does incremental balance update in-transaction
SELECT _disable_trigger_if_exists('ledger_entries', 'trg_sync_account_balance_on_ledger');

-- D2. Syncs customer table balance to AR account (wrong direction — GL is source of truth)
SELECT _disable_trigger_if_exists('customers', 'trg_sync_customer_to_ar');


-- ============================================================================
-- E. PO Payment Tracking (2 triggers)
-- Replaced by: supplierPaymentService PO tracking after payment
-- ============================================================================

-- E1. Calculates outstanding_amount on supplier_payments
SELECT _disable_trigger_if_exists('supplier_payments', 'calculate_outstanding_amount');

-- E2. Syncs payment totals to purchase_orders.paid_amount
SELECT _disable_trigger_if_exists('supplier_payments', 'sync_po_payments');


-- ============================================================================
-- F. Transaction Logic (4 triggers)
-- Each replaced by existing or new app-layer code
-- ============================================================================

-- F1. Sets product_type and income_account_id on sale_items from products table
-- Replaced by: salesRepository lookup before INSERT
SELECT _disable_trigger_if_exists('sale_items', 'trg_sale_items_set_product_type');

-- F2. GL failsafe for cost layers (already handled by costLayerService)
SELECT _disable_trigger_if_exists('cost_layers', 'trg_cost_layer_gl_failsafe');

-- F3. Legacy journal_entries → ledger_entries sync (AccountingCore creates entries directly)
SELECT _disable_trigger_if_exists('journal_entries', 'trg_sync_ledger_from_journal');

-- F4. Updates amount_available and status on pos_customer_deposits when amount_used changes
-- Replaced by: depositsRepository computes these in applyDepositToSaleInTransaction()
SELECT _disable_trigger_if_exists('pos_customer_deposits', 'trg_update_deposit_status');

-- Clean up helper function
DROP FUNCTION _disable_trigger_if_exists(TEXT, TEXT);

COMMIT;


-- ============================================================================
-- VERIFICATION: Confirm all 18 triggers are DISABLED
-- ============================================================================
SELECT 
    t.tgname AS trigger_name,
    c.relname AS table_name,
    CASE t.tgenabled 
        WHEN 'O' THEN '✓ ENABLED' 
        WHEN 'D' THEN '✗ DISABLED'
        WHEN 'R' THEN '✓ REPLICA'
        WHEN 'A' THEN '✓ ALWAYS'
    END AS status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE t.tgname IN (
    -- A. Supplier Balance
    'trg_sync_supplier_balance_on_gr',
    'trg_sync_supplier_balance_on_payment',
    'trg_sync_supplier_on_gr_complete',
    -- B. Customer Balance
    'trg_sync_customer_on_invoice',
    'trg_invoice_payment_sync',
    'trg_sync_invoice_to_customer',
    'trg_protect_customer_balance',
    -- C. Supplier Invoice/Payment
    'trg_sync_supplier_on_invoice',
    'trg_supplier_payment_allocation_sync',
    'trg_sync_supplier_on_payment',
    -- D. GL/Account
    'trg_sync_account_balance_on_ledger',
    'trg_sync_customer_to_ar',
    -- E. PO Tracking
    'calculate_outstanding_amount',
    'sync_po_payments',
    -- F. Transaction Logic
    'trg_sale_items_set_product_type',
    'trg_cost_layer_gl_failsafe',
    'trg_sync_ledger_from_journal',
    'trg_update_deposit_status'
)
ORDER BY c.relname, t.tgname;
