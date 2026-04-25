-- Find batches driving the 35,257 global gap
-- Use SM unit_cost (not batch.cost_price) for consistency with global SM total

-- 1. Per-batch: SM-cost expected vs actual batch value (using SM unit_cost)
WITH batch_sm_cost AS (
  SELECT 
    sm.batch_id,
    ROUND(SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN')
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 2) AS sm_inflow_cost,
    ROUND(SUM(CASE WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT')
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 2) AS sm_outflow_cost,
    ROUND(SUM(CASE WHEN sm.movement_type = 'SUPPLIER_RETURN'
                   THEN ABS(sm.quantity * COALESCE(sm.unit_cost,0)) ELSE 0 END), 2) AS sm_return_cost
  FROM stock_movements sm
  WHERE sm.batch_id IS NOT NULL
  GROUP BY sm.batch_id
),
batch_values AS (
  SELECT 
    b.id,
    p.name AS product_name,
    b.batch_number,
    b.goods_receipt_id,
    ROUND(b.remaining_quantity * b.cost_price, 2) AS current_batch_value,
    COALESCE(bsc.sm_inflow_cost, 0) - COALESCE(bsc.sm_outflow_cost, 0) - COALESCE(bsc.sm_return_cost, 0) AS sm_expected_cost,
    ROUND(b.remaining_quantity * b.cost_price, 2) - 
    (COALESCE(bsc.sm_inflow_cost, 0) - COALESCE(bsc.sm_outflow_cost, 0) - COALESCE(bsc.sm_return_cost, 0)) AS cost_discrepancy
  FROM inventory_batches b
  JOIN products p ON p.id = b.product_id
  LEFT JOIN batch_sm_cost bsc ON bsc.batch_id = b.id
  WHERE b.remaining_quantity > 0
)
SELECT 
  COUNT(*) AS batches_with_discrepancy,
  ROUND(SUM(cost_discrepancy), 2) AS total_cost_discrepancy,
  ROUND(SUM(CASE WHEN cost_discrepancy > 0 THEN cost_discrepancy ELSE 0 END), 2) AS positive,
  ROUND(SUM(CASE WHEN cost_discrepancy < 0 THEN cost_discrepancy ELSE 0 END), 2) AS negative
FROM batch_values
WHERE ABS(cost_discrepancy) > 0.5;

-- 2. Top discrepant batches (using SM cost, not batch.cost_price)
WITH batch_sm_cost AS (
  SELECT 
    sm.batch_id,
    ROUND(SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN')
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 2) AS sm_inflow_cost,
    ROUND(SUM(CASE WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT')
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 2) AS sm_outflow_cost,
    ROUND(SUM(CASE WHEN sm.movement_type = 'SUPPLIER_RETURN'
                   THEN ABS(sm.quantity * COALESCE(sm.unit_cost,0)) ELSE 0 END), 2) AS sm_return_cost
  FROM stock_movements sm
  WHERE sm.batch_id IS NOT NULL
  GROUP BY sm.batch_id
)
SELECT 
  p.name AS product_name,
  b.batch_number,
  b.remaining_quantity,
  b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS current_batch_value,
  COALESCE(bsc.sm_inflow_cost, 0) - COALESCE(bsc.sm_outflow_cost, 0) - COALESCE(bsc.sm_return_cost, 0) AS sm_expected_cost,
  ROUND(b.remaining_quantity * b.cost_price, 2) - 
    (COALESCE(bsc.sm_inflow_cost, 0) - COALESCE(bsc.sm_outflow_cost, 0) - COALESCE(bsc.sm_return_cost, 0)) AS cost_discrepancy
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
LEFT JOIN batch_sm_cost bsc ON bsc.batch_id = b.id
WHERE b.remaining_quantity > 0
ORDER BY ABS(ROUND(b.remaining_quantity * b.cost_price, 2) - 
    (COALESCE(bsc.sm_inflow_cost, 0) - COALESCE(bsc.sm_outflow_cost, 0) - COALESCE(bsc.sm_return_cost, 0))) DESC
LIMIT 20;

-- 3. Batches with remaining_quantity > 0 but NO SM records at all (received without SM)
SELECT 
  b.id, p.name, b.batch_number, b.source_type, b.goods_receipt_id,
  b.remaining_quantity, b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS batch_value
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
LEFT JOIN stock_movements sm ON sm.batch_id = b.id
WHERE b.remaining_quantity > 0
  AND sm.id IS NULL
ORDER BY ROUND(b.remaining_quantity * b.cost_price, 2) DESC
LIMIT 20;
