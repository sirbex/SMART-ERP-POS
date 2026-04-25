-- 1. Sum of rounding differences across all completed GRs (original batch value vs GL debit)
SELECT 
  COUNT(*) AS gr_count,
  ROUND(SUM(batch_val - gl_debit), 4) AS total_rounding_gap
FROM (
  SELECT 
    gr.receipt_number,
    ROUND(SUM(b.quantity * b.cost_price), 2) AS batch_val,
    COALESCE((
      SELECT ROUND(SUM(le."DebitAmount"), 2)
      FROM ledger_entries le
      JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
      JOIN accounts a ON a."Id" = le."AccountId"
      WHERE a."AccountCode" = '1300'
        AND lt."ReferenceNumber" = gr.receipt_number
    ), 0) AS gl_debit
  FROM goods_receipts gr
  JOIN inventory_batches b ON b.goods_receipt_id = gr.id
  WHERE gr.status = 'COMPLETED'
  GROUP BY gr.id, gr.receipt_number
) sub;

-- 2. Non-GR batches (stock adjustments) - do they all have GL?
SELECT 
  sm.movement_number,
  sm.movement_type,
  ROUND(sm.quantity * sm.unit_cost, 2) AS movement_value,
  COUNT(b.id) AS batch_count,
  ROUND(SUM(b.remaining_quantity * b.cost_price), 2) AS remaining_value,
  COALESCE((
    SELECT ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceNumber" = sm.movement_number
  ), 0) AS gl_net
FROM stock_movements sm
JOIN inventory_batches b ON b.source_movement_id = sm.id
WHERE sm.movement_type IN ('ADJUSTMENT_IN', 'MANUAL_ADJUSTMENT', 'RETURN', 'OPENING_STOCK')
  AND b.remaining_quantity > 0
GROUP BY sm.id, sm.movement_number, sm.movement_type, sm.unit_cost, sm.quantity
ORDER BY remaining_value DESC
LIMIT 30;

-- 3. Check what column links batches to adjustments
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'inventory_batches' ORDER BY ordinal_position;

-- 4. Batches without a goods_receipt_id - what's their total and do they all have GL?
SELECT 
  b.batch_number,
  b.batch_type,
  ROUND(b.quantity * b.cost_price, 2) AS original_value,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS remaining_value
FROM inventory_batches b
WHERE b.goods_receipt_id IS NULL
  AND b.remaining_quantity > 0
ORDER BY b.remaining_quantity * b.cost_price DESC
LIMIT 20;
