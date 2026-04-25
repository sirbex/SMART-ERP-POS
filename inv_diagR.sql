-- Find why product-level totals don't match diagC totals

-- 1. Direct batch sum to confirm fn_reconcile_inventory value
SELECT ROUND(SUM(remaining_quantity * cost_price), 2) AS batch_total
FROM inventory_batches
WHERE remaining_quantity > 0;

-- 2. Check if any batches have product_id not in products table (orphaned batches)
SELECT 
  b.id, b.batch_number, b.remaining_quantity, b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS batch_value
FROM inventory_batches b
LEFT JOIN products p ON p.id = b.product_id
WHERE b.remaining_quantity > 0
  AND p.id IS NULL;

-- 3. Check ALL movement types that exist in stock_movements
SELECT movement_type, reference_type, COUNT(*), 
  ROUND(SUM(quantity * COALESCE(unit_cost,0)), 2) AS total_cost
FROM stock_movements
GROUP BY movement_type, reference_type
ORDER BY movement_type, reference_type;

-- 4. Check RETURN movement type SMs (customer returns - these are INFLOWS to inventory)
SELECT 
  sm.movement_number, sm.movement_type, sm.reference_type,
  sm.quantity, sm.unit_cost, sm.batch_id,
  p.name AS product_name
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
WHERE sm.movement_type = 'RETURN'
ORDER BY sm.created_at;

-- 5. Check batches with product_id that IS in products table 
-- but doesn't appear in product_batch CTE (maybe due to join order issue)
-- Simple: raw sum grouped by product to see if it matches
SELECT ROUND(SUM(b.remaining_quantity * b.cost_price), 2) AS sum_via_product_join
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
WHERE b.remaining_quantity > 0;
