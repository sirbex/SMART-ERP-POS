-- 1. GL 1300 Balance vs inventory_batches subledger
SELECT 'GL 1300 Balance' AS source,
  ROUND(COALESCE(SUM(CASE WHEN jel.entry_type = 'DEBIT' THEN jel.amount ELSE -jel.amount END),0),2) AS balance
FROM journal_entry_lines jel
JOIN accounts a ON a.id=jel.account_id
WHERE a.code='1300'
UNION ALL
SELECT 'Inventory Batches Sum',
  ROUND(COALESCE(SUM(remaining_quantity * cost_price),0),2)
FROM inventory_batches WHERE remaining_quantity>0;

-- 2. Batches with NULL or zero cost_price (these undercount the subledger)
SELECT COUNT(*) AS null_zero_cost_batches, ROUND(COALESCE(SUM(remaining_quantity),0),4) AS total_qty
FROM inventory_batches WHERE remaining_quantity>0 AND (cost_price IS NULL OR cost_price=0);

-- 3. GL postings to 1300 by source/reference_type (breakdown of what built the GL balance)
SELECT je.source, je.reference_type,
  COUNT(*) AS entry_count,
  ROUND(SUM(CASE WHEN jel.entry_type='DEBIT' THEN jel.amount ELSE -jel.amount END),2) AS net_1300_impact
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id=jel.journal_entry_id
JOIN accounts a ON a.id=jel.account_id
WHERE a.code='1300'
GROUP BY je.source, je.reference_type
ORDER BY net_1300_impact DESC;

-- 4. Stock movements without a GL entry (orphan movements that affect physical but not GL)
SELECT sm.movement_type, COUNT(*) AS count,
  ROUND(SUM(sm.quantity * sm.unit_cost),2) AS estimated_value
FROM stock_movements sm
WHERE sm.journal_entry_id IS NULL
  AND sm.movement_type NOT IN ('OPENING_STOCK','ADJUSTMENT')
GROUP BY sm.movement_type;

-- 5. Recent stock adjustments that might be the source
SELECT
  ib.id, p.name AS product, ib.batch_number,
  ib.remaining_quantity, ib.cost_price,
  ROUND(ib.remaining_quantity * ib.cost_price, 2) AS batch_value,
  ib.created_at
FROM inventory_batches ib
JOIN products p ON p.id=ib.product_id
WHERE ib.remaining_quantity > 0
  AND (ib.cost_price IS NULL OR ib.cost_price = 0)
ORDER BY ib.created_at DESC;
