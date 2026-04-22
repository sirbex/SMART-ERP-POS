-- Deeper look at the inventory discrepancy

\echo '=== inventory_batches schema ==='
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'inventory_batches' ORDER BY ordinal_position;

\echo '=== BATCH-TEST-001 full record ==='
SELECT * FROM inventory_batches WHERE batch_number = 'BATCH-TEST-001';

\echo '=== The 2 ADJUSTMENT GL entries for Inventory (1300) ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceType",
  lt."ReferenceNumber",
  lt."Status",
  lt."Description",
  le."EntryType",
  le."DebitAmount",
  le."CreditAmount",
  lt."TransactionDate"::DATE
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'ADJUSTMENT'
ORDER BY lt."TransactionDate";

\echo '=== The REVERSAL GL entries for Inventory (1300) ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceType",
  lt."ReferenceNumber",
  lt."Status",
  le."EntryType",
  le."DebitAmount",
  le."CreditAmount",
  lt."TransactionDate"::DATE
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'REVERSAL'
ORDER BY lt."TransactionDate";

\echo '=== ALL GL entries for Inventory (1300) in full ==='
SELECT
  lt."TransactionNumber",
  lt."ReferenceType",
  lt."ReferenceNumber",
  lt."Status",
  le."EntryType",
  ROUND(le."DebitAmount",0) AS dr,
  ROUND(le."CreditAmount",0) AS cr,
  lt."TransactionDate"::DATE
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
ORDER BY lt."TransactionDate", lt."TransactionNumber";

\echo '=== Opening stock entries for products ==='
SELECT p.name, p.quantity_on_hand, p.cost_price,
       p.quantity_on_hand * p.cost_price AS value
FROM products p
ORDER BY p.quantity_on_hand * p.cost_price DESC
LIMIT 10;
