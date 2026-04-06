-- Compare product-level valuation vs batch-level valuation per product
-- Shows WHY qty_on_hand * cost_price != SUM(batch.remaining * batch.cost)
SELECT p.name,
       pi.quantity_on_hand AS prod_qty,
       ROUND(pi.quantity_on_hand * COALESCE(pv.cost_price, 0), 0) AS prod_val,
       COALESCE(b.batch_qty, 0) AS batch_qty,
       COALESCE(b.batch_val, 0) AS batch_val,
       ROUND(pi.quantity_on_hand * COALESCE(pv.cost_price, 0), 0) - COALESCE(b.batch_val, 0) AS diff
FROM products p
JOIN product_inventory pi ON pi.product_id = p.id
JOIN product_valuation pv ON pv.product_id = p.id
LEFT JOIN (
  SELECT product_id,
         SUM(remaining_quantity) AS batch_qty,
         SUM(ROUND(remaining_quantity * cost_price, 0)) AS batch_val
  FROM inventory_batches
  WHERE remaining_quantity > 0
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE pi.quantity_on_hand > 0
  AND ABS(ROUND(pi.quantity_on_hand * COALESCE(pv.cost_price, 0), 0) - COALESCE(b.batch_val, 0)) > 1
ORDER BY ABS(ROUND(pi.quantity_on_hand * COALESCE(pv.cost_price, 0), 0) - COALESCE(b.batch_val, 0)) DESC
LIMIT 20;
