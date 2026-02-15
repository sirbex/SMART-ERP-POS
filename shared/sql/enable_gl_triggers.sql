-- CRITICAL: Enable All GL Posting Triggers
-- These triggers must ALWAYS be enabled for the accounting module to work correctly
-- Run this script if you notice transactions missing from the General Ledger

-- Sales GL Posting
ALTER TABLE sales ENABLE TRIGGER trg_post_sale_to_ledger;
ALTER TABLE sales ENABLE TRIGGER trg_post_sale_void_to_ledger;

-- Goods Receipt GL Posting  
ALTER TABLE goods_receipts ENABLE TRIGGER trg_post_goods_receipt_to_ledger;

-- Customer Payments GL Posting
ALTER TABLE customer_payments ENABLE TRIGGER trg_post_customer_payment_to_ledger;

-- Expenses GL Posting
ALTER TABLE expenses ENABLE TRIGGER trg_post_expense_to_ledger;

-- Supplier Payments GL Posting
ALTER TABLE supplier_payments ENABLE TRIGGER trg_post_supplier_payment_to_ledger;

-- Customer Invoices GL Posting
ALTER TABLE invoices ENABLE TRIGGER trg_post_customer_invoice_to_ledger;

-- Supplier Invoices GL Posting
ALTER TABLE supplier_invoices ENABLE TRIGGER trg_post_supplier_invoice_to_ledger;

-- Customer Deposits GL Posting
ALTER TABLE pos_customer_deposits ENABLE TRIGGER trg_post_customer_deposit_to_ledger;

-- Ledger Balance Sync
ALTER TABLE ledger_entries ENABLE TRIGGER trg_sync_account_balance_on_ledger;

-- Verify all triggers are enabled
SELECT tgname as trigger_name, tgrelid::regclass as table_name, 
       CASE tgenabled WHEN 'O' THEN '✓ ENABLED' WHEN 'D' THEN '✗ DISABLED' END as status
FROM pg_trigger 
WHERE tgname LIKE '%ledger%' 
  AND NOT tgname LIKE 'RI_%'
ORDER BY tgrelid::regclass;
