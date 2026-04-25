-- Verify Glucose Tin 250g as the source of remaining ~8,504 gap

-- 1. All SM records for Glucose Tin product (regardless of batch_id)
SELECT 
  sm.movement_number,
  sm.movement_type,
  sm.reference_type,
  sm.quantity,
  sm.unit_cost,
  sm.batch_id,
  sm.created_at::DATE AS date
FROM stock_movements sm
JOIN products p ON p.id = sm.product_id
WHERE p.name ILIKE '%Glucose Tin%'
ORDER BY sm.created_at;

-- 2. All batches for Glucose Tin
SELECT 
  b.batch_number,
  b.quantity,
  b.remaining_quantity,
  b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS batch_value,
  b.source_type,
  b.status,
  b.received_date
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
WHERE p.name ILIKE '%Glucose Tin%'
ORDER BY b.received_date;

-- 3. Check ALL products with remaining_quantity > 0 that have NO SM records at all
-- (i.e., batch value in subledger but no corresponding SM → hidden batch-SM gap)
WITH product_sm AS (
  SELECT DISTINCT product_id 
  FROM stock_movements
),
active_batches AS (
  SELECT 
    p.id AS product_id,
    p.name AS product_name,
    SUM(b.remaining_quantity * b.cost_price) AS total_batch_value,
    SUM(b.remaining_quantity) AS total_remaining
  FROM inventory_batches b
  JOIN products p ON p.id = b.product_id
  WHERE b.remaining_quantity > 0
  GROUP BY p.id, p.name
)
SELECT 
  ab.product_name,
  ab.total_remaining,
  ab.total_batch_value
FROM active_batches ab
LEFT JOIN product_sm ps ON ps.product_id = ab.product_id
WHERE ps.product_id IS NULL
ORDER BY ab.total_batch_value DESC;

-- 4. Also find batches with active remaining_quantity where the SPECIFIC BATCH has no SM records
-- (SM exists for the product, but not for this specific batch)
SELECT 
  b.batch_number,
  p.name AS product_name,
  b.remaining_quantity,
  b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS batch_value,
  b.source_type
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
LEFT JOIN stock_movements sm ON sm.batch_id = b.id
WHERE b.remaining_quantity > 0
  AND sm.id IS NULL
ORDER BY b.remaining_quantity * b.cost_price DESC;

-- 5. Total value of all batches with no SM records (specific batch)
SELECT 
  COUNT(*) AS batch_count,
  ROUND(SUM(b.remaining_quantity * b.cost_price), 2) AS total_value_no_sm
FROM inventory_batches b
LEFT JOIN stock_movements sm ON sm.batch_id = b.id
WHERE b.remaining_quantity > 0
  AND sm.id IS NULL;
