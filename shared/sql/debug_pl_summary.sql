-- Debug P&L summary calculation

-- Check what the summary function returns
SELECT 'Summary Function Result:';
SELECT * FROM fn_get_profit_loss_summary('2025-12-01'::DATE, '2025-12-31'::DATE);

-- Manually check the expenses calculation
SELECT 'Manual Expense Check:';
SELECT 
    a."AccountCode",
    a."AccountName",
    COALESCE(SUM(le."DebitAmount"), 0) as debits,
    COALESCE(SUM(le."CreditAmount"), 0) as credits,
    COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0) as net
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE lt."TransactionDate"::DATE >= '2025-12-01'
  AND lt."TransactionDate"::DATE <= '2025-12-31'
  AND (a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE')
GROUP BY a."AccountCode", a."AccountName"
ORDER BY a."AccountCode";

-- Check all expense-type accounts
SELECT 'All Expense Type Accounts:';
SELECT 
    "AccountCode",
    "AccountName",
    "AccountType"
FROM accounts 
WHERE "AccountType" = 'EXPENSE' OR "AccountCode" LIKE '6%'
ORDER BY "AccountCode";
