-- Check if RETURN_GRN GL vs batch cost mismatch drives the 35,257 remaining gap

-- 1. Return GRN lines: unit_cost vs batch.cost_price (the GL uses rl.unit_cost, batch reduces by qty × batch.cost_price)
SELECT 
  r.return_grn_number,
  p.name AS product_name,
  rl.base_quantity AS qty,
  rl.unit_cost AS line_unit_cost,
  b.cost_price AS batch_cost_price,
  ROUND((rl.unit_cost - b.cost_price) * rl.base_quantity, 2) AS gl_vs_batch_gap
FROM return_grn r
JOIN return_grn_lines rl ON rl.rgrn_id = r.id
JOIN products p ON p.id = rl.product_id
LEFT JOIN inventory_batches b ON b.id = rl.batch_id
WHERE r.status = 'POSTED'
ORDER BY ABS(ROUND((rl.unit_cost - COALESCE(b.cost_price,0)) * rl.base_quantity, 2)) DESC;

-- 2. Total GL vs batch gap from RETURN_GRN unit cost mismatches
SELECT 
  ROUND(SUM(rl.unit_cost * rl.base_quantity), 2) AS gl_credit_from_lines,
  ROUND(SUM(COALESCE(b.cost_price, 0) * rl.base_quantity), 2) AS batch_reduction_from_lines,
  ROUND(SUM((rl.unit_cost - COALESCE(b.cost_price, 0)) * rl.base_quantity), 2) AS total_gl_vs_batch_gap
FROM return_grn r
JOIN return_grn_lines rl ON rl.rgrn_id = r.id
LEFT JOIN inventory_batches b ON b.id = rl.batch_id
WHERE r.status = 'POSTED';

-- 3. Summary of all GL-batch gap sources
-- GL debits vs batch inflows
SELECT 'GL debits vs SM inflows' AS component,
  118255135.56 AS gl_value,
  118255136.94 AS sm_value,
  ROUND(118255136.94 - 118255135.56, 2) AS gap
UNION ALL
-- SALE COGS: GL credits vs SM outflow cost
SELECT 'SALE COGS GL vs SM',
  15935179.00 AS gl_cogs,
  15914059.44 AS sm_cogs,
  ROUND(15914059.44 - 15935179.00, 2) AS gap  -- negative = GL over-credits (understates inventory)
UNION ALL  
-- RETURN_GRN: GL credits vs batch reduction (from above query)
SELECT 'RETURN_GRN GL vs batch',
  581215.00 AS gl_return,
  0 AS placeholder,  -- will be filled from query 2
  0 AS gap
UNION ALL
-- PHYSICAL COUNT OUT: SM = 110,000 = GL (assumed matched)
SELECT 'PHYSICAL COUNT OUT', 110000, 110000, 0;

-- 4. Check the Glucophage RETURN_GRN specifically
SELECT r.return_grn_number, p.name, rl.base_quantity, rl.unit_cost, b.cost_price,
  b.id AS batch_id, rl.batch_id AS line_batch_id
FROM return_grn r
JOIN return_grn_lines rl ON rl.rgrn_id = r.id
JOIN products p ON p.id = rl.product_id
LEFT JOIN inventory_batches b ON b.id = rl.batch_id
WHERE r.return_grn_number = 'RGRN-2026-0008';
