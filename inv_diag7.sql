-- Per-product: GL net for 1300 vs batch remaining value
-- This shows exactly which products have GL/batch mismatches
WITH product_gl AS (
  SELECT 
    p.id AS product_id,
    p.name AS product_name,
    ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS gl_net
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  JOIN products p ON p.id::TEXT = le."EntityId"
  WHERE a."AccountCode" = '1300'
  GROUP BY p.id, p.name
),
product_batches AS (
  SELECT 
    product_id,
    ROUND(SUM(ROUND(remaining_quantity * cost_price, 0)), 2) AS batch_value
  FROM inventory_batches
  WHERE remaining_quantity > 0
  GROUP BY product_id
)
SELECT 
  p.name AS product_name,
  p.sku,
  COALESCE(pg.gl_net, 0) AS gl_net,
  COALESCE(pb.batch_value, 0) AS batch_value,
  COALESCE(pg.gl_net, 0) - COALESCE(pb.batch_value, 0) AS gap
FROM products p
LEFT JOIN product_gl pg ON pg.product_id = p.id
LEFT JOIN product_batches pb ON pb.product_id = p.id
WHERE ABS(COALESCE(pg.gl_net, 0) - COALESCE(pb.batch_value, 0)) > 500
ORDER BY ABS(COALESCE(pg.gl_net, 0) - COALESCE(pb.batch_value, 0)) DESC
LIMIT 30;

-- Summary: total gap from products WITH EntityId in GL vs WITHOUT
SELECT
  SUM(CASE WHEN pg.product_id IS NOT NULL THEN COALESCE(pg.gl_net,0) - COALESCE(pb.batch_value,0) ELSE 0 END) AS gap_products_with_gl_entityid,
  SUM(CASE WHEN pg.product_id IS NULL THEN 0 - COALESCE(pb.batch_value,0) ELSE 0 END) AS gap_products_no_gl_entityid
FROM products p
LEFT JOIN (
  SELECT 
    p2.id AS product_id,
    ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS gl_net
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  JOIN products p2 ON p2.id::TEXT = le."EntityId"
  WHERE a."AccountCode" = '1300'
  GROUP BY p2.id
) pg ON pg.product_id = p.id
LEFT JOIN (
  SELECT product_id, ROUND(SUM(ROUND(remaining_quantity * cost_price, 0)), 2) AS batch_value
  FROM inventory_batches WHERE remaining_quantity > 0
  GROUP BY product_id
) pb ON pb.product_id = p.id
WHERE COALESCE(pb.batch_value, 0) > 0 OR COALESCE(pg.gl_net, 0) <> 0;
