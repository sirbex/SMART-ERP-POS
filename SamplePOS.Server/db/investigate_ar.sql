-- ============================================================
-- INVESTIGATE AR DISCREPANCY + FIX ALL BALANCE DRIFTS
-- ============================================================

\echo '=== AR (1200) — recent ledger activity ==='
SELECT
  lt."TransactionDate"::date::text AS date,
  lt."ReferenceNumber",
  lt."Description",
  le."DebitAmount",
  le."CreditAmount",
  le."Description" AS line_desc
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '1200'
WHERE lt."Status" = 'POSTED'
ORDER BY lt."TransactionDate" DESC
LIMIT 20;

\echo ''
\echo '=== AR running balance check (last 10 entries by date) ==='
SELECT
  lt."TransactionDate"::date::text AS date,
  lt."ReferenceNumber",
  le."DebitAmount",
  le."CreditAmount",
  SUM(le."DebitAmount" - le."CreditAmount")
    OVER (ORDER BY lt."TransactionDate" ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_balance
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId" AND a."AccountCode" = '1200'
WHERE lt."Status" = 'POSTED'
ORDER BY lt."TransactionDate";

\echo ''
\echo '=== Inventory+COGS linked entries — the ±50 pair ==='
SELECT
  lt."ReferenceNumber",
  lt."Description",
  lt."TransactionDate"::date::text AS date,
  a."AccountCode",
  a."AccountName",
  le."DebitAmount",
  le."CreditAmount"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" IN ('1300','5000')
  AND lt."Status" = 'POSTED'
ORDER BY lt."TransactionDate" DESC, lt."Id", le."LineNumber"
LIMIT 30;
