-- ============================================================================
-- MIGRATION 250: Disable GL Posting Triggers (Reversible)
-- 
-- ROOT CAUSE FIX for inventory (1300) reconciliation discrepancy.
-- 
-- PROBLEM: Both database triggers AND application-layer code
-- (glEntryService.ts → AccountingCore.createJournalEntry) were posting GL
-- entries to ledger_transactions/ledger_entries for the same transactions.
-- This caused double-counted balances and reconciliation mismatches.
--
-- SOLUTION: DISABLE all GL posting triggers. The application layer becomes
-- the single source of truth for GL posting. Triggers can be re-enabled
-- with enable_gl_triggers.sql if needed (reversible).
--
-- Application-layer GL posting is handled by:
--   - salesService.ts → recordSaleToGL, recordSaleVoidToGL
--   - goodsReceiptService.ts → recordGoodsReceiptToGL
--   - expenseService.ts → recordExpenseApprovalToGL, recordExpensePaymentToGL
--   - supplierPaymentService.ts → recordSupplierPaymentToGL
--   - depositsService.ts → recordCustomerDepositToGL
--   - invoiceService.ts → recordInvoicePaymentToGL
--   - stockMovementService.ts → recordStockMovementToGL
--   - paymentsService.ts → recordCustomerPaymentToGL
--
-- KEPT triggers (NOT disabled):
--   - trg_sync_account_balance_on_ledger (auto-updates account.CurrentBalance)
--   - trg_assert_gl_balance (validation guard)
--   - trg_enforce_period_ledger_entries (period locking)
--   - trg_enforce_period_ledger_transactions (period locking)
--   - trg_sync_ledger_from_journal (legacy journal_entries sync)
--   - All non-GL triggers (timestamps, auto-numbers, validation, balance sync)
--
-- Date: 2026-03-25
-- ============================================================================

BEGIN;

-- 1. Sale GL posting (sales table)
ALTER TABLE sales DISABLE TRIGGER trg_post_sale_to_ledger;

-- 2. Sale void GL reversal (sales table)
ALTER TABLE sales DISABLE TRIGGER trg_post_sale_void_to_ledger;

-- 3. Goods receipt GL posting (goods_receipts table)
ALTER TABLE goods_receipts DISABLE TRIGGER trg_post_goods_receipt_to_ledger;

-- 4. Expense GL posting (expenses table)
ALTER TABLE expenses DISABLE TRIGGER trg_post_expense_to_ledger;

-- 5. Supplier payment GL posting (supplier_payments table)
ALTER TABLE supplier_payments DISABLE TRIGGER trg_post_supplier_payment_to_ledger;

-- 6. Customer deposit GL posting (pos_customer_deposits table)
ALTER TABLE pos_customer_deposits DISABLE TRIGGER trg_post_customer_deposit_to_ledger;

-- 7. Customer invoice GL posting (invoices table)
ALTER TABLE invoices DISABLE TRIGGER trg_post_customer_invoice_to_ledger;

-- 8. Invoice payment GL posting (invoice_payments table)
ALTER TABLE invoice_payments DISABLE TRIGGER trg_post_invoice_payment_to_ledger;

-- 9. Customer payment GL posting (customer_payments table)
ALTER TABLE customer_payments DISABLE TRIGGER trg_post_customer_payment_to_ledger;

-- 10. Deposit application GL posting (pos_deposit_applications table)
ALTER TABLE pos_deposit_applications DISABLE TRIGGER trg_post_deposit_application_to_ledger;

-- 11. Stock movement GL posting (stock_movements table)
ALTER TABLE stock_movements DISABLE TRIGGER trg_post_stock_movement_to_ledger;

-- 12. Supplier invoice GL posting (supplier_invoices table)
ALTER TABLE supplier_invoices DISABLE TRIGGER trg_post_supplier_invoice_to_ledger;

COMMIT;

-- Verify: All GL posting triggers should show as DISABLED
SELECT 
    tgname AS trigger_name, 
    c.relname AS table_name,
    CASE tgenabled 
        WHEN 'O' THEN '✓ ENABLED' 
        WHEN 'D' THEN '✗ DISABLED' 
    END AS status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE NOT t.tgisinternal
  AND tgname LIKE '%post_%_to_ledger%'
ORDER BY c.relname, tgname;

-- Verify: These should still be ENABLED
SELECT 
    tgname AS trigger_name, 
    c.relname AS table_name,
    CASE tgenabled 
        WHEN 'O' THEN '✓ ENABLED' 
        WHEN 'D' THEN '✗ DISABLED' 
    END AS status
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE NOT t.tgisinternal
  AND tgname IN (
    'trg_sync_account_balance_on_ledger',
    'trg_enforce_period_ledger_entries',
    'trg_enforce_period_ledger_transactions',
    'tr_prevent_posted_modification',
    'trg_assert_gl_balance'
  )
ORDER BY tgname;
