-- Find the complete set of product-level batch vs SM discrepancies
-- that explain the remaining ~8,504 gap (beyond RETURN_GRN's 26,753)

-- 1. Product-level: batch remaining value vs SM expected remaining value
WITH product_sm AS (
  SELECT 
    sm.product_id,
    ROUND(SUM(CASE 
      WHEN sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN','DELIVERY') 
           AND sm.quantity > 0
      THEN sm.quantity * COALESCE(sm.unit_cost, 0) ELSE 0 END), 4) AS sm_inflows,
    ROUND(SUM(CASE 
      WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT','DAMAGE','EXPIRY') 
      THEN ABS(sm.quantity) * COALESCE(sm.unit_cost, 0) ELSE 0 END), 4) AS sm_outflows,
    ROUND(SUM(CASE 
      WHEN sm.movement_type = 'SUPPLIER_RETURN'
      THEN ABS(sm.quantity) * COALESCE(sm.unit_cost, 0) ELSE 0 END), 4) AS sm_returns
  FROM stock_movements sm
  GROUP BY sm.product_id
),
product_batch AS (
  SELECT 
    b.product_id,
    ROUND(SUM(b.remaining_quantity * b.cost_price), 4) AS batch_value
  FROM inventory_batches b
  WHERE b.remaining_quantity > 0
  GROUP BY b.product_id
),
product_comparison AS (
  SELECT 
    p.name AS product_name,
    COALESCE(pb.batch_value, 0) AS batch_value,
    COALESCE(psm.sm_inflows, 0) - COALESCE(psm.sm_outflows, 0) - COALESCE(psm.sm_returns, 0) AS sm_expected,
    ROUND(COALESCE(pb.batch_value, 0) - (COALESCE(psm.sm_inflows, 0) - COALESCE(psm.sm_outflows, 0) - COALESCE(psm.sm_returns, 0)), 4) AS batch_vs_sm_gap
  FROM products p
  LEFT JOIN product_sm psm ON psm.product_id = p.id
  LEFT JOIN product_batch pb ON pb.product_id = p.id
  WHERE COALESCE(pb.batch_value, 0) > 0
     OR COALESCE(psm.sm_inflows, 0) > 0
)
SELECT product_name, batch_value, sm_expected, batch_vs_sm_gap
FROM product_comparison
WHERE ABS(batch_vs_sm_gap) > 1
ORDER BY batch_vs_sm_gap DESC
LIMIT 30;

-- 2. Total batch vs SM gap to verify
WITH product_sm AS (
  SELECT 
    sm.product_id,
    SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN','DELIVERY') AND sm.quantity > 0
      THEN sm.quantity * COALESCE(sm.unit_cost, 0) ELSE 0 END) AS sm_inflows,
    SUM(CASE WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT','DAMAGE','EXPIRY')
      THEN ABS(sm.quantity) * COALESCE(sm.unit_cost, 0) ELSE 0 END) AS sm_outflows,
    SUM(CASE WHEN sm.movement_type = 'SUPPLIER_RETURN'
      THEN ABS(sm.quantity) * COALESCE(sm.unit_cost, 0) ELSE 0 END) AS sm_returns
  FROM stock_movements sm
  GROUP BY sm.product_id
),
product_batch AS (
  SELECT b.product_id, SUM(b.remaining_quantity * b.cost_price) AS batch_value
  FROM inventory_batches b
  WHERE b.remaining_quantity > 0
  GROUP BY b.product_id
)
SELECT 
  ROUND(SUM(COALESCE(pb.batch_value, 0)), 2) AS total_batch,
  ROUND(SUM(COALESCE(psm.sm_inflows, 0) - COALESCE(psm.sm_outflows, 0) - COALESCE(psm.sm_returns, 0)), 2) AS total_sm_expected,
  ROUND(SUM(COALESCE(pb.batch_value, 0)) - SUM(COALESCE(psm.sm_inflows, 0) - COALESCE(psm.sm_outflows, 0) - COALESCE(psm.sm_returns, 0)), 2) AS total_gap
FROM products p
LEFT JOIN product_sm psm ON psm.product_id = p.id
LEFT JOIN product_batch pb ON pb.product_id = p.id;
