-- Check RETURN_GRN properly reduced inventory_batches
-- 1. Return GRN summary
SELECT 
  r.return_number,
  r.status,
  r.total_amount,
  COUNT(rl.id) AS item_count,
  ROUND(SUM(rl.quantity * rl.unit_cost), 2) AS computed_cost
FROM return_grn r
JOIN return_grn_lines rl ON rl.return_grn_id = r.id
GROUP BY r.id, r.return_number, r.status, r.total_amount
ORDER BY r.return_number;

-- 2. Stock movements for RETURN_GRN type
SELECT 
  r.return_number,
  COUNT(sm.id) AS stock_movements,
  ROUND(SUM(ABS(sm.quantity_change * sm.unit_cost)), 2) AS total_cost_reduced
FROM return_grn r
LEFT JOIN stock_movements sm ON sm.reference_type = 'RETURN_GRN' 
  AND sm.reference_id::TEXT = r.id::TEXT
GROUP BY r.id, r.return_number
ORDER BY r.return_number;

-- 3. Return GRN lines with batch info
SELECT 
  r.return_number,
  rl.product_id,
  p.name AS product_name,
  rl.quantity,
  rl.unit_cost,
  rl.batch_id,
  b.remaining_quantity AS current_batch_remaining
FROM return_grn r
JOIN return_grn_lines rl ON rl.return_grn_id = r.id
JOIN products p ON p.id = rl.product_id
LEFT JOIN inventory_batches b ON b.id = rl.batch_id
ORDER BY r.return_number, p.name;
