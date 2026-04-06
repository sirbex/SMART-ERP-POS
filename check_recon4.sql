-- GL entries for inventory account 1300 (debits are stock IN, credits are stock OUT)
-- Compare total GR debits vs total sale credits
SELECT 
  'GL_DEBITS' AS src,
  COALESCE(SUM(le."DebitAmount"), 0) AS val
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300'
UNION ALL
SELECT 
  'GL_CREDITS',
  COALESCE(SUM(le."CreditAmount"), 0)
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300'
UNION ALL
-- Total value of ALL batches ever received (including consumed)
SELECT 'ALL_BATCH_RECEIVED', COALESCE(SUM(ROUND(quantity * cost_price, 0)), 0)
FROM inventory_batches
UNION ALL
-- Total consumed (quantity - remaining) * cost
SELECT 'ALL_BATCH_CONSUMED', COALESCE(SUM(ROUND((quantity - remaining_quantity) * cost_price, 0)), 0)
FROM inventory_batches
WHERE quantity > remaining_quantity;
