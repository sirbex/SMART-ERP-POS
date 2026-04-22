-- Full AR ledger and the specific 82156 root cause hunt
\echo '=== ALL AR (1200) ENTRIES in chronological order ==='
SELECT
  lt."TransactionDate"::date::text AS date,
  lt."ReferenceNumber",
  le."DebitAmount",
  le."CreditAmount",
  SUM(le."DebitAmount" - le."CreditAmount")
    OVER (ORDER BY lt."TransactionDate", lt."CreatedAt" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '1200'
WHERE lt."Status" = 'POSTED'
ORDER BY lt."TransactionDate", lt."CreatedAt";

\echo ''
\echo '=== CURRENT AR STORED BALANCE ==='
SELECT "AccountCode", "AccountName", "CurrentBalance" FROM accounts WHERE "AccountCode" = '1200';

\echo ''
\echo '=== Find all transactions touching cash for the +100 discrepancy ==='
-- Looking for a transaction where DR Cash 100 / CR Revenue 100 has ledger entries but CurrentBalance wasn't updated
SELECT
  lt."TransactionDate"::date::text AS date,
  lt."ReferenceNumber",
  lt."Description",
  SUM(CASE WHEN a."AccountCode" = '1010' THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END) AS cash_net,
  SUM(CASE WHEN a."AccountCode" = '4000' THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END) AS revenue_net
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" IN ('1010', '4000')
GROUP BY lt."Id", lt."TransactionDate", lt."ReferenceNumber", lt."Description"
HAVING ABS(SUM(CASE WHEN a."AccountCode" = '1010' THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END)) = 100
ORDER BY lt."TransactionDate";

\echo ''
\echo '=== Find the Inventory/COGS +50/-50 pair ==='
SELECT
  lt."TransactionDate"::date::text AS date,
  lt."ReferenceNumber",
  lt."Description",
  SUM(CASE WHEN a."AccountCode" = '1300' THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END) AS inv_credit_net,
  SUM(CASE WHEN a."AccountCode" = '5000' THEN le."DebitAmount" - le."CreditAmount" ELSE 0 END) AS cogs_debit_net
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" IN ('1300', '5000')
GROUP BY lt."Id", lt."TransactionDate", lt."ReferenceNumber", lt."Description"
HAVING ABS(SUM(CASE WHEN a."AccountCode" = '1300' THEN le."CreditAmount" - le."DebitAmount" ELSE 0 END)) = 50
ORDER BY lt."TransactionDate";
