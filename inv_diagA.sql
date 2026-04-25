-- Check RETURN_GRN: did they properly reduce inventory_batches?
SELECT 
  lt."ReferenceNumber",
  lt."Description",
  lt."TransactionDate"::DATE,
  ROUND(le."CreditAmount", 2) AS inventory_credit
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'RETURN_GRN'
ORDER BY lt."TransactionDate" DESC;

-- Total GL vs batch remaining for ALL batches (simple check)
SELECT 
  ROUND(SUM(ROUND(remaining_quantity * cost_price, 0)), 2) AS fn_batch_total,
  COUNT(*) AS batch_count
FROM inventory_batches 
WHERE remaining_quantity > 0;

-- Check accounts.CurrentBalance vs ledger sum for 1300 directly
SELECT 
  a."CurrentBalance" AS current_balance,
  COALESCE((
    SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    WHERE le."AccountId" = a."Id"
  ), 0) AS ledger_sum_with_lt_join,
  COALESCE((
    SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
    FROM ledger_entries le
    WHERE le."AccountId" = a."Id"
  ), 0) AS ledger_sum_without_lt_join
FROM accounts a
WHERE a."AccountCode" = '1300';

-- Are there ledger_entries for 1300 where TransactionId doesn't exist in ledger_transactions?
SELECT COUNT(*) AS orphaned_entries
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt WHERE lt."Id" = le."TransactionId"
  );
