-- ============================================================================
-- MIGRATION: Disable GL Posting Triggers
-- 
-- GL posting has been migrated from database triggers to application layer
-- (glEntryService.ts → AccountingCore.createJournalEntry → ledger_transactions)
--
-- This migration drops the 12 GL posting triggers that are now handled by:
--   - salesService.ts → recordSaleToGL, recordSaleVoidToGL
--   - goodsReceiptService.ts → recordGoodsReceiptToGL
--   - expenseService.ts → recordExpenseApprovalToGL, recordExpensePaymentToGL
--   - supplierPaymentService.ts → recordSupplierPaymentToGL
--   - depositsService.ts → recordCustomerDepositToGL
--   - invoiceService.ts → recordInvoicePaymentToGL
--   - stockMovementService.ts → recordStockMovementToGL
--   - paymentsService.ts → recordCustomerPaymentToGL
--
-- KEPT triggers:
--   - trg_assert_gl_balance (validation guard)
--   - trg_cost_layer_gl_failsafe (cost layer guard)
--   - trg_enforce_period_ledger_entries (period locking)
--   - trg_enforce_period_ledger_transactions (period locking)
--   - trg_sync_ledger_from_journal (legacy journal_entries sync)
--   - All non-GL triggers (timestamps, auto-numbers, validation, balance sync)
--
-- Date: 2026-03-XX
-- ============================================================================

BEGIN;

-- 1. Sale GL posting (sales table)
DROP TRIGGER IF EXISTS trg_post_sale_to_ledger ON sales;

-- 2. Sale void GL reversal (sales table)
DROP TRIGGER IF EXISTS trg_post_sale_void_to_ledger ON sales;

-- 3. Goods receipt GL posting (goods_receipts table)
DROP TRIGGER IF EXISTS trg_post_goods_receipt_to_ledger ON goods_receipts;

-- 4. Expense GL posting (expenses table)
DROP TRIGGER IF EXISTS trg_post_expense_to_ledger ON expenses;

-- 5. Supplier payment GL posting (supplier_payments table)
DROP TRIGGER IF EXISTS trg_post_supplier_payment_to_ledger ON supplier_payments;

-- 6. Customer deposit GL posting (pos_customer_deposits table)
DROP TRIGGER IF EXISTS trg_post_customer_deposit_to_ledger ON pos_customer_deposits;

-- 7. Customer invoice GL posting (invoices table)
-- Note: Sale GL already records AR/Revenue; this trigger was redundant
DROP TRIGGER IF EXISTS trg_post_customer_invoice_to_ledger ON invoices;

-- 8. Invoice payment GL posting (invoice_payments table)
DROP TRIGGER IF EXISTS trg_post_invoice_payment_to_ledger ON invoice_payments;

-- 9. Customer payment GL posting (customer_payments table)
DROP TRIGGER IF EXISTS trg_post_customer_payment_to_ledger ON customer_payments;

-- 10. Deposit application GL posting (pos_deposit_applications table)
-- Note: This trigger was effectively a no-op (returns NEW without posting)
DROP TRIGGER IF EXISTS trg_post_deposit_application_to_ledger ON pos_deposit_applications;

-- 11. Stock movement GL posting (stock_movements table)
DROP TRIGGER IF EXISTS trg_post_stock_movement_to_ledger ON stock_movements;

-- 12. Supplier invoice GL posting (supplier_invoices table)
-- NOTE: This trigger was dead code - condition required Status='Received'/'Approved'
-- but the app only uses 'Pending'/'PartiallyPaid'/'Paid'. GR finalization already
-- handles DR Inventory, CR AP via recordGoodsReceiptToGL(). No replacement needed.
DROP TRIGGER IF EXISTS trg_post_supplier_invoice_to_ledger ON supplier_invoices;

COMMIT;

-- Verify: List remaining GL-related triggers
SELECT tgname, c.relname as table_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
WHERE NOT t.tgisinternal
  AND (tgname LIKE '%ledger%' OR tgname LIKE '%gl%' OR tgname LIKE '%post_%_to_ledger%')
ORDER BY tgname;
