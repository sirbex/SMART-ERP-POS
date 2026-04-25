-- The remaining ~8,505 gap: GL COGS uses sale_items.unit_cost (FIFO-derived)
-- but SM/batch uses batch.cost_price. These differ at the per-item level.
-- For UoM conversions: sale_items.unit_cost = itemCost / item.quantity (may round differently)

-- 1. Per-sale-item: compare sale_items.unit_cost vs SM.unit_cost vs batch.cost_price
-- This identifies where FIFO cost ≠ batch cost
WITH item_costs AS (
  SELECT 
    s.sale_number,
    p.name AS product_name,
    si.quantity,
    si.unit_cost AS si_unit_cost,     -- FIFO-derived, used in GL
    sm.unit_cost AS sm_unit_cost,     -- batch.cost_price at time of sale, used in SM
    b.cost_price AS current_batch_cp,
    -- GL COGS = si.unit_cost × si.quantity
    ROUND(si.unit_cost * si.quantity, 2) AS gl_cogs,
    -- SM/batch cost = sm.unit_cost × qty
    ROUND(sm.unit_cost * sm.quantity, 2) AS sm_cogs,
    -- Difference: GL over-credits when positive
    ROUND(si.unit_cost * si.quantity - sm.unit_cost * sm.quantity, 2) AS gl_vs_sm_gap
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN stock_movements sm ON sm.reference_id = s.id 
    AND sm.reference_type = 'SALE'
    AND sm.product_id = si.product_id
    AND sm.batch_id = si.batch_id  -- same batch to avoid cross-matching
  JOIN inventory_batches b ON b.id = sm.batch_id
  JOIN products p ON p.id = si.product_id
  WHERE s.status = 'COMPLETED'
    AND si.item_type = 'product'
    AND si.batch_id IS NOT NULL
    AND ABS(si.unit_cost - sm.unit_cost) > 0.01  -- unit cost differs
)
SELECT 
  COUNT(*) AS mismatch_count,
  ROUND(SUM(gl_vs_sm_gap), 2) AS total_gl_vs_sm_gap,
  ROUND(SUM(CASE WHEN gl_vs_sm_gap > 0 THEN gl_vs_sm_gap ELSE 0 END), 2) AS gl_overcredits,
  ROUND(SUM(CASE WHEN gl_vs_sm_gap < 0 THEN gl_vs_sm_gap ELSE 0 END), 2) AS gl_undercredits
FROM item_costs;

-- 2. Top mismatches (product and sale number)
WITH item_costs AS (
  SELECT 
    s.sale_number,
    p.name AS product_name,
    si.quantity,
    si.unit_cost AS si_unit_cost,
    sm.unit_cost AS sm_unit_cost,
    ROUND(si.unit_cost * si.quantity - sm.unit_cost * sm.quantity, 2) AS gl_vs_sm_gap
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  JOIN stock_movements sm ON sm.reference_id = s.id 
    AND sm.reference_type = 'SALE'
    AND sm.product_id = si.product_id
    AND sm.batch_id = si.batch_id
  JOIN products p ON p.id = si.product_id
  WHERE s.status = 'COMPLETED'
    AND si.item_type = 'product'
    AND si.batch_id IS NOT NULL
    AND ABS(si.unit_cost - sm.unit_cost) > 0.01
)
SELECT sale_number, product_name, quantity, si_unit_cost, sm_unit_cost, gl_vs_sm_gap
FROM item_costs
ORDER BY ABS(gl_vs_sm_gap) DESC
LIMIT 20;

-- 3. Check sales where batch_id in sale_items IS NULL but SM has batch_id
-- These are items where GL COGS was posted but SM used a different batch
SELECT 
  s.sale_number,
  p.name,
  si.quantity, si.unit_cost AS si_cost,
  sm.quantity AS sm_qty, sm.unit_cost AS sm_cost,
  sm.batch_id IS NOT NULL AS sm_has_batch
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.id = si.product_id
LEFT JOIN stock_movements sm ON sm.reference_id = s.id 
  AND sm.reference_type = 'SALE'
  AND sm.product_id = si.product_id
WHERE s.status = 'COMPLETED'
  AND si.item_type = 'product'
  AND si.batch_id IS NULL
  AND sm.id IS NOT NULL
ORDER BY ABS(si.unit_cost * si.quantity - sm.unit_cost * sm.quantity) DESC
LIMIT 20;

-- 4. Overall GL vs batch from COGS: total sale_items cost vs SM total
SELECT 
  ROUND(SUM(si.unit_cost * si.quantity), 2) AS total_gl_cogs_basis,
  ROUND(SUM(sm.unit_cost * sm.quantity), 2) AS total_sm_cogs
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN stock_movements sm ON sm.reference_id = s.id 
  AND sm.reference_type = 'SALE'
  AND sm.product_id = si.product_id
  AND (sm.batch_id = si.batch_id OR (sm.batch_id IS NULL AND si.batch_id IS NULL))
WHERE s.status = 'COMPLETED'
  AND si.item_type = 'product';
