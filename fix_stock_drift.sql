-- ============================================================================
-- PRODUCT STOCK vs BATCH ANALYSIS
-- ============================================================================

-- 1. Total count of drifted products
SELECT '=== TOTAL DRIFTED PRODUCTS ===' AS info;
SELECT COUNT(*) AS drifted_count
FROM products p
JOIN (
  SELECT product_id, SUM(remaining_quantity) AS batch_sum
  FROM inventory_batches
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE p.quantity_on_hand != b.batch_sum;

-- 2. Products without any batches but with stock
SELECT '=== PRODUCTS WITH STOCK BUT NO BATCHES ===' AS info;
SELECT COUNT(*) AS count
FROM products p
WHERE p.quantity_on_hand > 0
  AND NOT EXISTS (SELECT 1 FROM inventory_batches WHERE product_id = p.id);

-- 3. Total inventory value check: All drifted products
SELECT '=== DRIFT DISTRIBUTION ===' AS info;
SELECT
  COUNT(*) FILTER (WHERE p.quantity_on_hand > b.batch_sum) AS stock_higher,
  COUNT(*) FILTER (WHERE p.quantity_on_hand < b.batch_sum) AS batch_higher,
  SUM(ABS(p.quantity_on_hand - b.batch_sum)) AS total_units_drift
FROM products p
JOIN (
  SELECT product_id, SUM(remaining_quantity) AS batch_sum
  FROM inventory_batches
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE p.quantity_on_hand != b.batch_sum;

-- 4. Fix: Recalculate quantity_on_hand from batches (FEFO source of truth)
-- Only update products that have batches
SELECT '=== FIXING: Recalculating quantity_on_hand from batches ===' AS info;

UPDATE products p
SET quantity_on_hand = b.batch_sum,
    updated_at = NOW()
FROM (
  SELECT product_id, SUM(remaining_quantity) AS batch_sum
  FROM inventory_batches
  GROUP BY product_id
) b
WHERE b.product_id = p.id
  AND p.quantity_on_hand != b.batch_sum;

-- 5. Verify fix
SELECT '=== AFTER FIX: Remaining drift (should be 0) ===' AS info;
SELECT COUNT(*) AS remaining_drift
FROM products p
JOIN (
  SELECT product_id, SUM(remaining_quantity) AS batch_sum
  FROM inventory_batches
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE p.quantity_on_hand != b.batch_sum;
