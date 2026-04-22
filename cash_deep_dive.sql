-- SALE-2026-0045 deep dive
\echo '=== SALE-2026-0045 record ==='
SELECT sale_number, total_amount, amount_paid, payment_method, status, created_at
FROM sales WHERE sale_number = 'SALE-2026-0045';

\echo '=== All GL transactions touching SALE-2026-0045 (Cash account) ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceNumber",
  lt."TransactionDate"::date as date,
  lt."Status",
  le."EntryType",
  le."DebitAmount",
  le."CreditAmount",
  le."Description"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND (lt."ReferenceNumber" = 'SALE-2026-0045'
    OR lt."ReferenceNumber" LIKE 'REV-SALE-2026-0045%'
    OR lt."ReferenceNumber" LIKE 'REF-2026-001%'
    OR lt."ReferenceNumber" LIKE 'REF-2026-000%')
ORDER BY lt."TransactionDate", lt."TransactionNumber";

\echo '=== All refunds in the system ==='
SELECT ref_number, original_sale_number, refund_amount, refund_method, status, created_at
FROM refunds
ORDER BY created_at
LIMIT 30;

\echo '=== REVERSED transactions - what were they ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceNumber",
  lt."TransactionDate"::date as date,
  lt."Status",
  SUM(le."DebitAmount") as debit,
  SUM(le."CreditAmount") as credit
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND lt."Status" = 'REVERSED'
GROUP BY lt."TransactionNumber", lt."ReferenceNumber", lt."TransactionDate", lt."Status"
ORDER BY lt."TransactionDate";

\echo '=== Net Cash accounting: include ALL statuses ==='
SELECT
  lt."Status",
  SUM(le."DebitAmount") as total_debit,
  SUM(le."CreditAmount") as total_credit,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as net
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
GROUP BY lt."Status"
ORDER BY lt."Status";

\echo '=== Net Cash accounting: POSTED only ==='
SELECT
  SUM(le."DebitAmount") as posted_debit,
  SUM(le."CreditAmount") as posted_credit,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as posted_net
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND lt."Status" = 'POSTED';

\echo '=== Net Cash accounting: ALL statuses combined ==='
SELECT
  SUM(le."DebitAmount") as all_debit,
  SUM(le."CreditAmount") as all_credit,
  SUM(le."DebitAmount") - SUM(le."CreditAmount") as all_net
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010';

\echo '=== Sales table payment methods ==='
SELECT payment_method, COUNT(*) as cnt, SUM(total_amount) as total
FROM sales
WHERE status = 'COMPLETED'
GROUP BY payment_method
ORDER BY total DESC;

\echo '=== Refunds: impact on cash by sale ==='
SELECT
  lt."ReferenceNumber",
  lt."TransactionDate"::date,
  SUM(le."DebitAmount") as cash_in,
  SUM(le."CreditAmount") as cash_out,
  le."Description"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND lt."ReferenceNumber" LIKE 'REF-%'
  AND lt."Status" = 'POSTED'
GROUP BY lt."ReferenceNumber", lt."TransactionDate"::date, le."Description"
ORDER BY SUM(le."CreditAmount") DESC;

\echo '=== Check if REV-SALE-2026-0045 fully negates the original ==='
-- Original SALE: DR Cash 3.6B  (REVERSED - excluded from POSTED)
-- Reversal REV-SALE-2026-0045: CR Cash 3.6B  (POSTED)
-- Refunds REF-2026-0008 thru REF-2026-0014 for SALE-2026-0045: CR Cash ~360M (POSTED)
-- Problem: The refunds AND the full reversal both exist → double-refund

SELECT
  'REF entries for SALE-2026-0045' as category,
  COUNT(*) as count,
  SUM(le."CreditAmount") as total_cash_credited
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
  AND lt."ReferenceNumber" LIKE 'REF-2026-00%'
  AND lt."Status" = 'POSTED'
  AND le."Description" LIKE '%SALE-2026-0045%';
