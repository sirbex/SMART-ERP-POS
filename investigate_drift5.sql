-- Total value of ADJUSTMENT_IN movements that have NO GL posting, still in stock (not yet sold)
-- These are the ones CURRENTLY inflating the subledger without GL backing
SELECT
  ROUND(SUM(remaining_stock_value),2) AS current_unposted_inventory_value,
  COUNT(*) AS batch_count
FROM (
  SELECT ib.remaining_quantity * ib.cost_price AS remaining_stock_value
  FROM stock_movements sm
  JOIN inventory_batches ib ON ib.id = sm.batch_id
  WHERE sm.movement_type = 'ADJUSTMENT_IN'
    AND ib.remaining_quantity > 0
    AND NOT EXISTS (
      SELECT 1 FROM ledger_entries le
      JOIN accounts a ON a."Id"=le."AccountId"
      WHERE a."AccountCode"='1300'
        AND le."EntityId" = sm.id::text
    )
) t;

-- Breakdown by reference_type
SELECT
  sm.reference_type,
  COUNT(*) AS movements,
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost,0)),2) AS total_value_moved,
  ROUND(SUM(ib.remaining_quantity * COALESCE(ib.cost_price,0)),2) AS still_in_stock_value
FROM stock_movements sm
LEFT JOIN inventory_batches ib ON ib.id=sm.batch_id
WHERE sm.movement_type='ADJUSTMENT_IN'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_entries le
    JOIN accounts a ON a."Id"=le."AccountId"
    WHERE a."AccountCode"='1300'
      AND le."EntityId"=sm.id::text
  )
GROUP BY sm.reference_type
ORDER BY total_value_moved DESC;
