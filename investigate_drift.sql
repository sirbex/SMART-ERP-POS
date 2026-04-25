-- 1. Top-level: GL 1300 vs inventory_batches
SELECT 'GL 1300 Balance' AS source,
  ROUND(COALESCE(SUM(CASE WHEN je.entry_type = 'DEBIT' THEN jl.amount ELSE -jl.amount END),0),2) AS balance
FROM journal_lines jl
JOIN journal_entries je ON je.id=jl.journal_entry_id
JOIN accounts a ON a.id=jl.account_id
WHERE a.code='1300'
UNION ALL
SELECT 'Inventory Batches Sum', ROUND(COALESCE(SUM(remaining_quantity*cost_price),0),2)
FROM inventory_batches WHERE remaining_quantity>0;

-- 2. Batches with NULL cost_price (these reduce the subledger total)
SELECT COUNT(*) AS null_cost_batches, ROUND(SUM(remaining_quantity),2) AS qty
FROM inventory_batches WHERE remaining_quantity>0 AND (cost_price IS NULL OR cost_price=0);

-- 3. Products where GL share > batch value (top 10 discrepancies)
SELECT
  p.name AS product,
  ROUND(SUM(ib.remaining_quantity*ib.cost_price),2) AS batch_value,
  COUNT(*) AS batch_count,
  ROUND(SUM(ib.remaining_quantity),4) AS total_qty
FROM inventory_batches ib
JOIN products p ON p.id=ib.product_id
WHERE ib.remaining_quantity>0
GROUP BY p.id, p.name
ORDER BY batch_value DESC
LIMIT 20;

-- 4. Stock adjustments that credited 1300 directly (possible unmapped entries)
SELECT je.source, je.reference_type, COUNT(*) AS cnt,
  ROUND(SUM(CASE WHEN je.entry_type='DEBIT' THEN jl.amount ELSE -jl.amount END),2) AS net_impact
FROM journal_lines jl
JOIN journal_entries je ON je.id=jl.journal_entry_id
JOIN accounts a ON a.id=jl.account_id
WHERE a.code='1300'
GROUP BY je.source, je.reference_type
ORDER BY net_impact DESC;
