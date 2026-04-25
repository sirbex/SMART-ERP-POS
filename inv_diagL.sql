-- Investigate remaining ~8,505 unexplained gap
-- The batch-SM global gap = 35,257.50
-- Explained so far: RETURN_GRN unit_cost issues = 26,753.33, Void unit_cost diff = 2.80
-- Remaining: ~8,500

-- 1. For ALL SM records: compare SM unit_cost vs batch.cost_price
-- Grouped by reference_type and movement_type
-- Gap = batch.cost_price × qty - SM unit_cost × qty (positive = batch > SM, understates GL)
SELECT 
  sm.reference_type,
  sm.movement_type,
  COUNT(*) AS sm_count,
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2) AS sm_cost_total,
  ROUND(SUM(sm.quantity * COALESCE(b.cost_price, 0)), 2) AS batch_cost_total,
  ROUND(SUM(sm.quantity * COALESCE(b.cost_price, 0)) - SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2) AS batch_vs_sm_delta
FROM stock_movements sm
JOIN inventory_batches b ON b.id = sm.batch_id
WHERE sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN','SALE','ADJUSTMENT_OUT')
GROUP BY sm.reference_type, sm.movement_type
HAVING ABS(ROUND(SUM(sm.quantity * COALESCE(b.cost_price, 0)) - SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2)) > 0.5
ORDER BY ABS(ROUND(SUM(sm.quantity * COALESCE(b.cost_price, 0)) - SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2)) DESC;

-- 2. Full gap decomposition using SM × batch.cost_price for each category
-- If we re-price all SM outflows at batch.cost_price instead of SM unit_cost
WITH repriced AS (
  SELECT 
    ROUND(SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN') 
                   THEN sm.quantity * COALESCE(b.cost_price,0) ELSE 0 END), 2) AS repriced_inflows,
    ROUND(SUM(CASE WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT') 
                   THEN sm.quantity * COALESCE(b.cost_price,0) ELSE 0 END), 2) AS repriced_outflows,
    ROUND(SUM(CASE WHEN sm.movement_type = 'SUPPLIER_RETURN' 
                   THEN ABS(sm.quantity * COALESCE(b.cost_price,0)) ELSE 0 END), 2) AS repriced_returns
  FROM stock_movements sm
  JOIN inventory_batches b ON b.id = sm.batch_id
)
SELECT 
  repriced_inflows,
  repriced_outflows,
  repriced_returns,
  repriced_inflows - repriced_outflows - repriced_returns AS repriced_expected,
  101685120.00 AS actual_batch_remaining,
  repriced_inflows - repriced_outflows - repriced_returns - 101685120.00 AS gap_if_repriced
FROM repriced;

-- 3. SALE SM where unit_cost != batch.cost_price (per-transaction level gaps)
SELECT 
  s.sale_number,
  p.name AS product_name,
  sm.quantity,
  ROUND(sm.unit_cost, 4) AS sm_unit_cost,
  ROUND(b.cost_price, 4) AS batch_cost_price,
  ROUND((b.cost_price - sm.unit_cost) * sm.quantity, 2) AS unit_cost_gap
FROM stock_movements sm
JOIN sales s ON s.id = sm.reference_id
JOIN inventory_batches b ON b.id = sm.batch_id
JOIN products p ON p.id = sm.product_id
WHERE sm.reference_type = 'SALE'
  AND sm.movement_type = 'SALE'
  AND ABS(sm.unit_cost - b.cost_price) > 0.01
ORDER BY ABS(ROUND((b.cost_price - sm.unit_cost) * sm.quantity, 2)) DESC
LIMIT 30;

-- 4. ADJUSTMENT_IN SM where unit_cost != batch.cost_price
SELECT 
  sm.movement_number,
  sm.reference_type,
  p.name AS product_name,
  sm.quantity,
  ROUND(sm.unit_cost, 4) AS sm_unit_cost,
  ROUND(b.cost_price, 4) AS batch_cost_price,
  ROUND((b.cost_price - sm.unit_cost) * sm.quantity, 2) AS unit_cost_gap
FROM stock_movements sm
JOIN inventory_batches b ON b.id = sm.batch_id
JOIN products p ON p.id = sm.product_id
WHERE sm.movement_type = 'ADJUSTMENT_IN'
  AND ABS(sm.unit_cost - b.cost_price) > 0.01
ORDER BY ABS(ROUND((b.cost_price - sm.unit_cost) * sm.quantity, 2)) DESC;

-- 5. VOID SM unit_cost vs batch.cost_price (batch restored at cost_price but SM uses sale's unit_cost)
SELECT 
  sm.movement_number, p.name,
  sm.quantity, sm.unit_cost AS void_sm_cost,
  -- Find the batch that was likely restored (newest active batch for this product)
  (SELECT b2.cost_price FROM inventory_batches b2 
   WHERE b2.product_id = sm.product_id AND b2.status = 'ACTIVE' 
   ORDER BY b2.received_date DESC LIMIT 1) AS restored_batch_cost,
  ROUND(sm.quantity * (
    (SELECT COALESCE(b2.cost_price,0) FROM inventory_batches b2 
     WHERE b2.product_id = sm.product_id AND b2.status = 'ACTIVE' 
     ORDER BY b2.received_date DESC LIMIT 1) - sm.unit_cost), 2) AS unit_cost_gap
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
WHERE sm.reference_type = 'VOID' AND sm.batch_id IS NULL;
