-- Migration 064: Drop CAT 4 (Protection) and CAT 5 (Validation) triggers
-- These protections have been moved to the service/repository layer:
--   - expenseRepository.ts: PAID/APPROVED status guards
--   - supplierPaymentRepository.ts: COMPLETED payment + Cancelled invoice guards
--   - quotationRepository.ts: atomic convert-once WHERE clause
--   - bankingService.ts: reconciled skip in matchStatementLine
--   - All other protections already existed in service layer
-- Date: 2026-03-XX

BEGIN;

-- =====================================================
-- CAT 4: PROTECTION TRIGGERS (14 triggers)
-- =====================================================

-- Bank transactions: reconciled protection
DROP TRIGGER IF EXISTS trg_protect_reconciled_bank_txn ON bank_transactions;

-- Delivery notes: posted immutability
DROP TRIGGER IF EXISTS trg_immutable_posted_delivery_note ON delivery_notes;
DROP TRIGGER IF EXISTS trg_immutable_posted_dn_lines ON delivery_note_lines;

-- Expenses: paid/approved protection
DROP TRIGGER IF EXISTS trg_protect_paid_expense ON expenses;

-- Goods receipts: completed protection
DROP TRIGGER IF EXISTS trg_protect_completed_gr ON goods_receipts;

-- Invoices: paid/cancelled protection
DROP TRIGGER IF EXISTS trg_protect_paid_invoice ON invoices;

-- Ledger transactions: posted modification prevention
DROP TRIGGER IF EXISTS tr_prevent_posted_modification ON ledger_transactions;

-- Purchase orders: completed protection
DROP TRIGGER IF EXISTS trg_protect_completed_po ON purchase_orders;

-- Quotations: converted protection
DROP TRIGGER IF EXISTS tr_protect_converted_quotation ON quotations;

-- Sales: completed/voided protection
DROP TRIGGER IF EXISTS trg_protect_completed_sale ON sales;

-- Stock movements: full immutability
DROP TRIGGER IF EXISTS trg_protect_stock_movements ON stock_movements;

-- Supplier invoices: paid protection
DROP TRIGGER IF EXISTS trg_protect_paid_supplier_invoice ON supplier_invoices;

-- Supplier payments: completed protection
DROP TRIGGER IF EXISTS trg_protect_completed_supplier_payment ON supplier_payments;

-- Customers: balance change notice (non-blocking)
DROP TRIGGER IF EXISTS trg_protect_customer_balance ON customers;


-- =====================================================
-- CAT 5: VALIDATION TRIGGERS (12 triggers)
-- =====================================================

-- Goods receipts: finalization + totals validation
DROP TRIGGER IF EXISTS trg_validate_gr_finalization ON goods_receipts;
DROP TRIGGER IF EXISTS trg_validate_gr_totals ON goods_receipts;

-- Inventory batches: negative stock check
DROP TRIGGER IF EXISTS trg_check_inventory_not_negative ON inventory_batches;

-- Invoice payments: overpayment prevention
DROP TRIGGER IF EXISTS trg_prevent_invoice_overpayment ON invoice_payments;

-- Journal entry lines: balance validation
DROP TRIGGER IF EXISTS trg_check_journal_entry_balance ON journal_entry_lines;

-- Ledger entries: GL balance assertion
DROP TRIGGER IF EXISTS trg_assert_gl_balance ON ledger_entries;

-- Ledger transactions: debit/credit balance validation
DROP TRIGGER IF EXISTS tr_validate_transaction_balance ON ledger_transactions;

-- Purchase orders: totals validation
DROP TRIGGER IF EXISTS trg_validate_po_totals ON purchase_orders;

-- Quotations: totals validation
DROP TRIGGER IF EXISTS trg_validate_quotation_totals ON quotations;

-- Sales: totals + payment + credit customer validation
DROP TRIGGER IF EXISTS trg_validate_sale_totals ON sales;
DROP TRIGGER IF EXISTS trg_validate_sale_payment ON sales;
DROP TRIGGER IF EXISTS trg_check_credit_sale_customer ON sales;


-- =====================================================
-- DROP ORPHANED FUNCTIONS (26 functions)
-- =====================================================

-- CAT 4 functions
DROP FUNCTION IF EXISTS fn_protect_reconciled_bank_transaction() CASCADE;
DROP FUNCTION IF EXISTS prevent_posted_delivery_note_edit() CASCADE;
DROP FUNCTION IF EXISTS prevent_posted_dn_line_edit() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_paid_expense() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_completed_gr() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_paid_invoice() CASCADE;
DROP FUNCTION IF EXISTS prevent_posted_modification() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_completed_po() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_converted_quotation() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_completed_sale() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_stock_movements() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_paid_supplier_invoice() CASCADE;
DROP FUNCTION IF EXISTS fn_protect_completed_supplier_payment() CASCADE;
DROP FUNCTION IF EXISTS protect_computed_balances() CASCADE;

-- CAT 5 functions
DROP FUNCTION IF EXISTS validate_gr_finalization() CASCADE;
DROP FUNCTION IF EXISTS fn_validate_gr_totals() CASCADE;
DROP FUNCTION IF EXISTS check_inventory_not_negative() CASCADE;
DROP FUNCTION IF EXISTS fn_prevent_invoice_overpayment() CASCADE;
DROP FUNCTION IF EXISTS check_journal_entry_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_assert_gl_balance() CASCADE;
DROP FUNCTION IF EXISTS validate_transaction_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_validate_po_totals() CASCADE;
DROP FUNCTION IF EXISTS fn_validate_quotation_totals() CASCADE;
DROP FUNCTION IF EXISTS fn_validate_sale_totals() CASCADE;
DROP FUNCTION IF EXISTS validate_sale_payment() CASCADE;
DROP FUNCTION IF EXISTS check_credit_sale_customer() CASCADE;

COMMIT;
