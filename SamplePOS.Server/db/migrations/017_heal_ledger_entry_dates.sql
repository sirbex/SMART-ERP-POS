-- Heal: align ledger_entries.EntryDate to ledger_transactions.TransactionDate
-- Defect: AccountingCore previously omitted EntryDate from INSERT, causing
-- backdated postings (opening balances, corrections) to default to NOW().
-- TransactionDate is the authoritative posting date; sync entries to match.

BEGIN;

-- Show divergence count first
SELECT COUNT(*) AS divergent_rows
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE le."EntryDate"::date <> lt."TransactionDate"::date;

UPDATE ledger_entries le
SET "EntryDate" = lt."TransactionDate"
FROM ledger_transactions lt
WHERE lt."Id" = le."TransactionId"
  AND le."EntryDate"::date <> lt."TransactionDate"::date;

-- Verify
SELECT COUNT(*) AS still_divergent
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE le."EntryDate"::date <> lt."TransactionDate"::date;

COMMIT;
