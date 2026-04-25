-- Verify current state before writing the fix

-- 1. Run fn_reconcile_inventory to get current gap
SELECT source, amount, difference, status FROM fn_reconcile_inventory();

-- 2. Direct GL balance from ledger_entries (authoritative)
SELECT 
  ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS gl_1300_from_entries
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300';

-- 3. accounts.CurrentBalance vs ledger_entries computed balance for 1300
SELECT 
  a."AccountCode",
  a."AccountName",
  a."CurrentBalance" AS stored_balance,
  ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS computed_from_entries,
  a."CurrentBalance" - ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS stored_vs_entries_diff
FROM accounts a
JOIN ledger_entries le ON le."AccountId" = a."Id"
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
WHERE a."AccountCode" = '1300'
GROUP BY a."AccountCode", a."AccountName", a."CurrentBalance";

-- 4. True batch value (raw, no per-line rounding)
SELECT ROUND(SUM(remaining_quantity * cost_price), 2) AS true_batch_value
FROM inventory_batches
WHERE remaining_quantity > 0;

-- 5. Confirm the exact true gap (GL from entries vs true batch)
SELECT 
  ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS gl_balance,
  (SELECT ROUND(SUM(remaining_quantity * cost_price), 2) FROM inventory_batches WHERE remaining_quantity > 0) AS true_batch,
  (SELECT ROUND(SUM(remaining_quantity * cost_price), 2) FROM inventory_batches WHERE remaining_quantity > 0)
    - ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS true_gap
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300';
