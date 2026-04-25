-- Get product-level detail on UNKNOWN batches - find which products they belong to
SELECT 
  p.name AS product_name,
  p.sku,
  b.batch_number,
  b.remaining_quantity,
  b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS remaining_value,
  b.created_at::DATE AS created_date,
  -- Check if there's a STOCK_MOVEMENT GL for this product
  COALESCE((
    SELECT ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceType" = 'STOCK_MOVEMENT'
      AND le."EntityId" = p.id::TEXT
  ), 0) AS product_stock_mvt_gl
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
WHERE b.goods_receipt_id IS NULL
  AND b.remaining_quantity > 0
ORDER BY b.remaining_quantity * b.cost_price DESC
LIMIT 30;

-- STOCK_MOVEMENT GL entries detail (what products, what amounts)
SELECT 
  le."EntityId" AS product_id,
  p.name AS product_name,
  lt."ReferenceNumber",
  lt."Description",
  ROUND(le."DebitAmount", 2) AS debit,
  ROUND(le."CreditAmount", 2) AS credit
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
LEFT JOIN products p ON p.id::TEXT = le."EntityId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'STOCK_MOVEMENT'
ORDER BY le."DebitAmount" DESC
LIMIT 30;
