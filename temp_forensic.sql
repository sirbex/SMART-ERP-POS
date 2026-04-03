-- Q1: Count opening stock GL entries
SELECT COUNT(*) AS opening_stock_gl_count
FROM ledger_transactions
WHERE "IdempotencyKey" LIKE 'OPENING_STOCK-%';

-- Q2: Sample idempotency keys (old format)
SELECT "IdempotencyKey", "TotalDebitAmount", "TotalCreditAmount"
FROM ledger_transactions
WHERE "IdempotencyKey" LIKE 'OPENING_STOCK-%'
LIMIT 5;

-- Q3: Pick 3 real product+batch combos
SELECT ib.product_id, ib.batch_number, p.name AS product_name,
       ib.remaining_quantity, ib.cost_price,
       (ib.remaining_quantity * ib.cost_price)::numeric(15,2) AS batch_value
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
LIMIT 3;

-- Q4: Per-key GL inventory effect for first 5 opening stock keys
SELECT lt."IdempotencyKey",
       SUM(le."DebitAmount" - le."CreditAmount") AS inventory_effect,
       COUNT(*) AS line_count
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'OPENING_STOCK'
GROUP BY lt."IdempotencyKey"
LIMIT 5;

-- Q5: AGGREGATE totals
SELECT 'GL_INVENTORY_1300' AS source,
       SUM(le."DebitAmount" - le."CreditAmount")::numeric(15,2) AS total_value
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'OPENING_STOCK'
UNION ALL
SELECT 'BATCH_VALUATION' AS source,
       SUM(remaining_quantity * cost_price)::numeric(15,2) AS total_value
FROM inventory_batches;
