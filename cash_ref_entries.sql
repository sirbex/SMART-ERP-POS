-- Full double-entry for all orphaned REF entries
\echo '=== Full double-entry for 5 orphaned REF entries for SALE-2026-0045 ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceNumber",
  lt."TransactionDate"::date,
  le."EntryType",
  a."AccountCode",
  a."AccountName",
  le."DebitAmount",
  le."CreditAmount",
  le."Description"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE lt."ReferenceNumber" IN ('REF-2026-0008','REF-2026-0009','REF-2026-0010','REF-2026-0011','REF-2026-0014')
ORDER BY lt."TransactionNumber", le."EntryType";

\echo '=== Summary: which accounts were debited in the 5 orphaned REFs ==='
SELECT
  a."AccountCode",
  a."AccountName",
  SUM(le."DebitAmount") as total_debit,
  SUM(le."CreditAmount") as total_credit
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE lt."ReferenceNumber" IN ('REF-2026-0008','REF-2026-0009','REF-2026-0010','REF-2026-0011','REF-2026-0014')
GROUP BY a."AccountCode", a."AccountName"
ORDER BY a."AccountCode";

\echo '=== Full double-entry for REV-SALE-2026-0045 (the full reversal) ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceNumber",
  lt."TransactionDate"::date,
  le."EntryType",
  a."AccountCode",
  a."AccountName",
  le."DebitAmount",
  le."CreditAmount",
  le."Description"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE lt."ReferenceNumber" = 'REV-SALE-2026-0045'
ORDER BY le."EntryType";

\echo '=== Current Cash balance computed including ALL statuses (correct method) ==='
SELECT
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as correct_cash_balance
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010';

\echo '=== What Cash SHOULD be after voiding orphaned REFs (preview) ==='
SELECT
  (SUM(le."DebitAmount") - SUM(le."CreditAmount")) + 360000000 as corrected_cash_balance
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010';

\echo '=== All account impacts of the 5 orphaned REFs ==='
SELECT
  a."AccountCode",
  a."AccountName",
  a."NormalBalance",
  SUM(le."DebitAmount") as debit,
  SUM(le."CreditAmount") as credit,
  CASE WHEN a."NormalBalance" = 'DEBIT'
    THEN SUM(le."DebitAmount") - SUM(le."CreditAmount")
    ELSE SUM(le."CreditAmount") - SUM(le."DebitAmount")
  END as balance_impact
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE lt."ReferenceNumber" IN ('REF-2026-0008','REF-2026-0009','REF-2026-0010','REF-2026-0011','REF-2026-0014')
GROUP BY a."AccountCode", a."AccountName", a."NormalBalance"
ORDER BY a."AccountCode";
