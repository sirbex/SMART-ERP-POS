-- Find GR items column name and batch cost drift

-- 1. GR items schema columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'goods_receipt_items' AND table_schema = 'public'
ORDER BY ordinal_position;

-- 2. Multi-batch sale items (si.batch_id IS NULL) net GL vs SM COGS
-- Group by sale to avoid Cartesian product
WITH sale_gl AS (
  SELECT 
    si.sale_id,
    ROUND(SUM(si.unit_cost * si.quantity), 2) AS gl_cogs
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  WHERE s.status = 'COMPLETED'
    AND si.item_type = 'product'
    AND si.batch_id IS NULL
  GROUP BY si.sale_id
),
sale_sm AS (
  SELECT 
    sm.reference_id AS sale_id,
    ROUND(SUM(sm.unit_cost * sm.quantity), 2) AS sm_cogs
  FROM stock_movements sm
  WHERE sm.reference_type = 'SALE'
  GROUP BY sm.reference_id
)
SELECT
  COUNT(*) AS sale_count,
  ROUND(SUM(sg.gl_cogs), 2) AS total_gl_cogs,
  ROUND(SUM(ss.sm_cogs), 2) AS total_sm_cogs,
  ROUND(SUM(sg.gl_cogs - ss.sm_cogs), 2) AS net_gl_over_credit
FROM sale_gl sg
JOIN sale_sm ss ON ss.sale_id = sg.sale_id;

-- 3. Check if any inventory_batches.cost_price differs from GR received cost
-- (would mean batch cost was updated after initial creation, causing GL vs batch drift)
SELECT 
  b.batch_number,
  p.name AS product_name,
  b.cost_price AS current_cost,
  b.source_type,
  b.remaining_quantity,
  gri.cost_price AS original_gr_cost,
  ROUND((b.cost_price - gri.cost_price) * b.remaining_quantity, 2) AS cost_drift_on_remaining
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
JOIN goods_receipt_items gri ON gri.goods_receipt_id = b.goods_receipt_id 
  AND gri.product_id = b.product_id
WHERE b.remaining_quantity > 0
  AND b.source_type = 'GR'
  AND ABS(b.cost_price - gri.cost_price) > 0.01
LIMIT 30;

-- 4. Net gap from batch cost_price vs GR cost_price (total drift on all remaining batches)
SELECT 
  COUNT(*) AS batch_count,
  ROUND(SUM((b.cost_price - gri.cost_price) * b.remaining_quantity), 2) AS total_cost_drift
FROM inventory_batches b
JOIN goods_receipt_items gri ON gri.goods_receipt_id = b.goods_receipt_id 
  AND gri.product_id = b.product_id
WHERE b.remaining_quantity > 0
  AND b.source_type = 'GR'
  AND ABS(b.cost_price - gri.cost_price) > 0.01;
