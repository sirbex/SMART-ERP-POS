-- Find ALL SM records with batch_id=NULL and their contribution to the gap

-- 1. All SM records where batch_id IS NULL
SELECT 
  sm.movement_number,
  sm.movement_type,
  sm.reference_type,
  sm.reference_id,
  sm.quantity,
  sm.unit_cost,
  ROUND(sm.quantity * COALESCE(sm.unit_cost, 0), 2) AS cost_impact,
  p.name AS product_name
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
WHERE sm.batch_id IS NULL
ORDER BY sm.movement_type, sm.reference_type;

-- 2. Total by movement direction for NULL-batch SMs
SELECT 
  movement_type,
  reference_type,
  COUNT(*) AS cnt,
  ROUND(SUM(quantity * COALESCE(unit_cost, 0)), 2) AS total_cost,
  ROUND(SUM(quantity), 4) AS total_qty
FROM stock_movements
WHERE batch_id IS NULL
GROUP BY movement_type, reference_type;

-- 3. For VOID SMs (batch_id=NULL), compare SM unit_cost to the ACTUAL batch that was restored
-- The void code restores: batchId if known, else newest active batch
-- For items WITH original batchId: batch got restored, SM references that batch
-- For items WITHOUT original batchId (batch sold via FEFO): restored to newest batch at its cost
WITH void_items AS (
  SELECT 
    sm.movement_number,
    sm.product_id,
    sm.quantity AS void_qty,
    sm.unit_cost AS sm_cost,
    sm.reference_id AS sale_id
  FROM stock_movements sm
  WHERE sm.reference_type = 'VOID' AND sm.batch_id IS NULL
),
original_sale_items AS (
  SELECT si.sale_id, si.product_id, si.batch_id, si.unit_cost, si.quantity
  FROM sale_items si
)
SELECT 
  v.movement_number,
  p.name AS product_name,
  v.void_qty,
  v.sm_cost AS void_sm_unit_cost,
  osi.batch_id AS original_sale_batch,
  osi.unit_cost AS sale_item_unit_cost,
  b.cost_price AS current_batch_cost_price,
  -- The batch was restored at remaining_quantity + qty, so its value increased by qty × cost_price
  -- If cost_price ≠ SM unit_cost, there's a discrepancy
  ROUND((b.cost_price - v.sm_cost) * v.void_qty, 2) AS batch_vs_sm_gap
FROM void_items v
JOIN products p ON p.id = v.product_id
LEFT JOIN original_sale_items osi ON osi.sale_id = v.sale_id AND osi.product_id = v.product_id
LEFT JOIN inventory_batches b ON b.id = osi.batch_id;

-- 4. Check if batch.cost_price has changed for any batch (by comparing GR cost vs batch cost)
-- A batch created with one cost that was later updated would cause GL vs batch drift
SELECT 
  b.batch_number,
  p.name AS product_name,
  b.cost_price AS current_cost,
  gri.unit_cost AS original_gr_cost,
  ROUND((b.cost_price - gri.unit_cost) * b.remaining_quantity, 2) AS cost_drift_on_remaining
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
JOIN goods_receipt_items gri ON gri.goods_receipt_id = b.goods_receipt_id 
  AND gri.product_id = b.product_id
WHERE b.remaining_quantity > 0
  AND ABS(b.cost_price - gri.unit_cost) > 0.01
LIMIT 20;
