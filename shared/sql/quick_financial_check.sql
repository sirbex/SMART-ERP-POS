-- Quick financial summary

-- Sales count vs Sale ledger transactions
SELECT 'Sales Table Count' as metric, COUNT(*)::text as value FROM sales
UNION ALL
SELECT 'Sale Ledger Transactions', COUNT(*)::text FROM ledger_transactions WHERE "ReferenceType" = 'SALE'
UNION ALL
SELECT 'Total Ledger Transactions', COUNT(*)::text FROM ledger_transactions
UNION ALL
SELECT 'Total Ledger Entries', COUNT(*)::text FROM ledger_entries
UNION ALL
SELECT 'Goods Receipts Count', COUNT(*)::text FROM goods_receipts
UNION ALL
SELECT 'GR Ledger Transactions', COUNT(*)::text FROM ledger_transactions WHERE "ReferenceType" = 'GOODS_RECEIPT';

-- Account balances summary
SELECT 
    "AccountCode",
    "AccountName",
    "AccountType",
    "CurrentBalance"::numeric as balance
FROM accounts
WHERE "CurrentBalance"::numeric != 0
ORDER BY "AccountCode";

-- Check total debits = total credits
SELECT 
    'Total Debits' as metric,
    ROUND(SUM("DebitAmount")::numeric, 2) as value
FROM ledger_entries
UNION ALL
SELECT 
    'Total Credits',
    ROUND(SUM("CreditAmount")::numeric, 2)
FROM ledger_entries;

-- Sales not in ledger
SELECT 
    s.sale_number,
    s.total_amount,
    s.created_at,
    CASE WHEN lt."Id" IS NULL THEN 'MISSING FROM LEDGER' ELSE 'OK' END as ledger_status
FROM sales s
LEFT JOIN ledger_transactions lt ON lt."ReferenceType" = 'SALE' AND lt."ReferenceId" = s.id
ORDER BY s.created_at;
