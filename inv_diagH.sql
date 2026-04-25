-- Investigate the 7 batch discrepancies and find their root cause

-- 1. All SM records for the Flucamox discrepant batch (15 extra units, cost 14,070)
SELECT sm.movement_number, sm.movement_type, sm.reference_type, sm.reference_id,
  sm.quantity, sm.unit_cost, sm.batch_id IS NOT NULL AS has_batch_id
FROM stock_movements sm
WHERE sm.batch_id = 'eff43cac-12ab-4cfe-81bc-906165c5c68d'
ORDER BY sm.created_at;

-- 2. Any SM records for Flucamox product (batch_id NULL might be a void/reversal)
SELECT sm.movement_number, sm.movement_type, sm.reference_type,
  sm.quantity, sm.unit_cost, sm.batch_id
FROM stock_movements sm
JOIN inventory_batches b ON b.product_id = sm.product_id
WHERE b.id = 'eff43cac-12ab-4cfe-81bc-906165c5c68d'
  AND sm.batch_id IS DISTINCT FROM 'eff43cac-12ab-4cfe-81bc-906165c5c68d'
ORDER BY sm.created_at;

-- 3. For all 7 discrepant batches: list their SM records (to spot the pattern)
SELECT 
  b.id AS batch_id, p.name, b.remaining_quantity, b.cost_price,
  sm.movement_type, sm.reference_type, sm.quantity, sm.unit_cost
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
LEFT JOIN stock_movements sm ON sm.batch_id = b.id
WHERE b.id IN (
  'eff43cac-12ab-4cfe-81bc-906165c5c68d',
  '8b7ea6d8-e43b-48f7-84a1-cb810df30ee2',
  '1cec43fa-3c5d-432d-bb8a-fec3dacf1670',
  '9e52f98b-dac5-46da-82bf-5205400645a4',
  'f9e14151-8774-47e3-8a06-08c7584be83b',
  '736487e2-a7ff-4e72-9af7-58da7ee2008c',
  '602bec7f-7950-4e59-a9aa-bc2b90cd8e71'
)
ORDER BY p.name, sm.movement_type;

-- 4. Check if any sale_refunds exist that restored stock but WITHOUT a corresponding SM
SELECT sr.refund_number, sri.product_id, p.name, sri.quantity, sri.sale_item_id,
  si.batch_id AS original_batch
FROM sale_refunds sr
JOIN sale_refund_items sri ON sri.refund_id = sr.id
JOIN products p ON p.id = sri.product_id
JOIN sale_items si ON si.id = sri.sale_item_id
ORDER BY sr.created_at DESC
LIMIT 20;

-- 5. Confirm GL vs SM unit cost difference pattern across all sales
-- How many sales have unit_cost in sale_items != unit_cost in stock_movements?
WITH sale_item_costs AS (
  SELECT si.sale_id, si.product_id, si.batch_id,
    ROUND(si.unit_cost, 2) AS si_unit_cost
  FROM sale_items si
  WHERE si.item_type = 'product' AND si.batch_id IS NOT NULL
),
sm_costs AS (
  SELECT sm.reference_id AS sale_id, sm.product_id, sm.batch_id,
    ROUND(sm.unit_cost, 2) AS sm_unit_cost
  FROM stock_movements sm
  WHERE sm.reference_type = 'SALE' AND sm.batch_id IS NOT NULL
)
SELECT 
  COUNT(*) AS mismatched_items,
  ROUND(SUM(si.si_unit_cost - sm.sm_unit_cost), 2) AS total_unit_cost_diff
FROM sale_item_costs si
JOIN sm_costs sm ON sm.sale_id = si.sale_id 
  AND sm.product_id = si.product_id 
  AND sm.batch_id = si.batch_id
WHERE ABS(si.si_unit_cost - sm.sm_unit_cost) > 0.01;
