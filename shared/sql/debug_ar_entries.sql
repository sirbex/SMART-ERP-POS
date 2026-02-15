-- Debug: Check all Accounts Receivable (1200) ledger entries
SELECT 
    le."Id" as entry_id,
    lt."TransactionDate"::date as txn_date,
    lt."Description" as description,
    le."DebitAmount" as debit,
    le."CreditAmount" as credit,
    lt."ReferenceType" as ref_type,
    lt."ReferenceNumber" as ref_num
FROM ledger_entries le 
JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id" 
JOIN accounts a ON le."AccountId" = a."Id" 
WHERE a."AccountCode" = '1200'
ORDER BY lt."TransactionDate" DESC, lt."CreatedAt" DESC;

-- Check invoices and their payment status
SELECT 
    i.id,
    i.invoice_number,
    i.total_amount,
    i.amount_paid,
    i.balance_due,
    i.status,
    i.created_at::date
FROM invoices i
ORDER BY i.created_at DESC
LIMIT 10;

-- Check invoice payments
SELECT 
    ip.id,
    ip.invoice_id,
    ip.amount,
    ip.payment_date::date,
    ip.payment_method
FROM invoice_payments ip
ORDER BY ip.payment_date DESC
LIMIT 10;

-- Check sales with their credit status
SELECT 
    s.id,
    s.sale_number,
    s.total_amount,
    s.amount_paid,
    s.change_amount,
    s.payment_method,
    s.sale_date::date,
    s.status
FROM sales s
ORDER BY s.created_at DESC
LIMIT 10;
