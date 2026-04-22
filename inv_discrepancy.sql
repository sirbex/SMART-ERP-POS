-- Investigate inventory reconciliation discrepancy
-- GL: 5,856,338  |  Batch valuation: 4,057,894,714  |  Product valuation: 272,310,428

-- 1. Top batches by value
\echo '=== Top 20 batches by value ==='
SELECT
  ib.id,
  p.name AS product_name,
  ib.batch_number,
  ib.remaining_quantity,
  ib.cost_price,
  ROUND(ib.remaining_quantity * ib.cost_price, 0) AS batch_value,
  ib.created_at::DATE AS created
FROM inventory_batches ib
JOIN products p ON p.id = ib.product_id
ORDER BY ib.remaining_quantity * ib.cost_price DESC
LIMIT 20;

-- 2. Total batch valuation sanity
\echo '=== Batch valuation totals ==='
SELECT
  COUNT(*) AS num_batches,
  COUNT(*) FILTER (WHERE remaining_quantity > 0) AS positive_batches,
  COUNT(*) FILTER (WHERE remaining_quantity < 0) AS negative_batches,
  ROUND(SUM(remaining_quantity * cost_price), 0) AS total_value,
  ROUND(SUM(remaining_quantity * cost_price) FILTER (WHERE remaining_quantity > 0), 0) AS positive_value,
  ROUND(SUM(remaining_quantity * cost_price) FILTER (WHERE remaining_quantity < 0), 0) AS negative_value
FROM inventory_batches;

-- 3. Products with quantity_on_hand >> batch remaining_quantity
\echo '=== Products where product qty differs from batch qty ==='
SELECT
  p.name,
  p.quantity_on_hand AS prod_qty,
  COALESCE(SUM(ib.remaining_quantity), 0) AS batch_qty,
  p.cost_price AS prod_cost,
  ROUND(p.quantity_on_hand * p.cost_price, 0) AS prod_value,
  ROUND(COALESCE(SUM(ib.remaining_quantity), 0) * MAX(ib.cost_price), 0) AS batch_value
FROM products p
LEFT JOIN inventory_batches ib ON ib.product_id = p.id
GROUP BY p.id, p.name, p.quantity_on_hand, p.cost_price
HAVING ABS(p.quantity_on_hand - COALESCE(SUM(ib.remaining_quantity), 0)) > 10
ORDER BY ABS(p.quantity_on_hand - COALESCE(SUM(ib.remaining_quantity), 0)) DESC
LIMIT 20;

-- 4. Inventory GL breakdown: what drove the GL to 5.8M?
\echo '=== Inventory GL (1300) by reference type ==='
SELECT
  lt."ReferenceType",
  ROUND(SUM(le."DebitAmount"), 0) AS total_dr,
  ROUND(SUM(le."CreditAmount"), 0) AS total_cr,
  ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0) AS net,
  COUNT(*) AS entries
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
GROUP BY lt."ReferenceType"
ORDER BY ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) DESC;

-- 5. Are there batches linked to SALE-2026-0045 that shouldn't exist?
\echo '=== Batches related to goods receipts of void/orphan items ==='
SELECT
  ib.batch_number,
  ib.remaining_quantity,
  ib.cost_price,
  ROUND(ib.remaining_quantity * ib.cost_price, 0) AS value,
  ib.source_type,
  ib.source_reference
FROM inventory_batches ib
WHERE ib.remaining_quantity > 1000
   OR ib.remaining_quantity * ib.cost_price > 10000000
ORDER BY ib.remaining_quantity * ib.cost_price DESC
LIMIT 30;

-- 6. Compare product.quantity_on_hand vs batches
\echo '=== Sum comparison ==='
SELECT
  (SELECT ROUND(SUM(quantity_on_hand * cost_price), 0) FROM products) AS product_valuation,
  (SELECT ROUND(SUM(remaining_quantity * cost_price), 0) FROM inventory_batches) AS batch_valuation,
  (SELECT ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
   FROM ledger_entries le JOIN accounts a ON a."Id" = le."AccountId"
   WHERE a."AccountCode" = '1300') AS gl_balance;
