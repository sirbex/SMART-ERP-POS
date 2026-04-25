-- 1. Exact numbers: GL 1300 vs subledger (both methods)
SELECT
  'GL 1300 (ledger_entries)' AS source,
  ROUND(COALESCE(SUM(CASE WHEN le."EntryType"='DEBIT' THEN le."Amount" ELSE -le."Amount" END),0),2) AS balance
FROM ledger_entries le
JOIN accounts a ON a."Id"=le."AccountId"
WHERE a."AccountCode"='1300'
UNION ALL
SELECT 'Batches (with COALESCE)',
  ROUND(COALESCE(SUM(remaining_quantity * COALESCE(cost_price,0)),0),2)
FROM inventory_batches WHERE remaining_quantity>0
UNION ALL
SELECT 'Batches (raw, no COALESCE)',
  ROUND(COALESCE(SUM(remaining_quantity * cost_price),0),2)
FROM inventory_batches WHERE remaining_quantity>0;

-- 2. Batches with NULL cost_price (raw NULL, not 0) — these cause SUM to undercount
SELECT COUNT(*) AS null_cost_batches,
  ROUND(COALESCE(SUM(remaining_quantity),0),4) AS total_qty
FROM inventory_batches
WHERE remaining_quantity>0 AND cost_price IS NULL;

-- 3. If there ARE null-cost batches, show them
SELECT p.name, ib.batch_number, ib.remaining_quantity, ib.cost_price,
  ib.created_at::date, ib.id
FROM inventory_batches ib
JOIN products p ON p.id=ib.product_id
WHERE ib.remaining_quantity>0 AND ib.cost_price IS NULL
ORDER BY ib.created_at DESC;

-- 4. Stock adjustments IN with no corresponding GL posting to 1300
-- (adjustments that added stock but no DR 1300 was posted)
SELECT sm.id, p.name AS product, sm.movement_type, sm.quantity, sm.unit_cost,
  ROUND(sm.quantity * COALESCE(sm.unit_cost,0),2) AS expected_gl_value,
  sm.reference_type, sm.notes, sm.created_at::date,
  EXISTS(
    SELECT 1 FROM ledger_entries le
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE a."AccountCode"='1300'
      AND le."EntityId"=sm.id::text
  ) AS has_gl_posting
FROM stock_movements sm
JOIN products p ON p.id=sm.product_id
WHERE sm.movement_type='ADJUSTMENT_IN'
  AND sm.created_at >= NOW() - INTERVAL '30 days'
ORDER BY sm.created_at DESC
LIMIT 40;

-- 5. Total value of ADJUSTMENT_IN movements that have no GL posting
SELECT
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost,0)),2) AS unposted_adjustment_value,
  COUNT(*) AS count
FROM stock_movements sm
WHERE sm.movement_type='ADJUSTMENT_IN'
  AND NOT EXISTS(
    SELECT 1 FROM ledger_entries le
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE a."AccountCode"='1300'
      AND le."EntityId"=sm.id::text
  );
