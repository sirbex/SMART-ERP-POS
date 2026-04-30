SELECT a."AccountCode", a."AccountName", 
       SUM(le."CreditAmount") - SUM(le."DebitAmount") as net_balance,
       SUM(le."CreditAmount") as total_credit,
       SUM(le."DebitAmount") as total_debit
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" IN ('2100','2150')
GROUP BY a."AccountCode", a."AccountName"
ORDER BY a."AccountCode";
