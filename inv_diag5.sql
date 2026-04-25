-- Check non-GR batches using correct column names
SELECT 
  b.batch_number,
  b.source_type,
  b.source_reference_id,
  ROUND(b.quantity * b.cost_price, 2) AS original_value,
  ROUND(b.remaining_quantity * b.cost_price, 2) AS remaining_value
FROM inventory_batches b
WHERE b.goods_receipt_id IS NULL
  AND b.remaining_quantity > 0
ORDER BY b.remaining_quantity * b.cost_price DESC
LIMIT 30;

-- Rounding gap excluding the 5 opening GRs
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
    AND gr.receipt_number NOT IN ('GR-2026-0001','GR-2026-0002','GR-2026-0003','GR-2026-0004','GR-2026-0005')
  GROUP BY gr.id, gr.receipt_number
) sub;

-- What are the source_types for non-GR batches?
SELECT source_type, COUNT(*), ROUND(SUM(remaining_quantity * cost_price), 2) AS total_remaining_value
FROM inventory_batches
WHERE goods_receipt_id IS NULL AND remaining_quantity > 0
GROUP BY source_type;

-- Check if stock adjustments (STOCK_MOVEMENT GL) cover these batches
-- by looking at STOCK_MOVEMENT GL entries in detail
SELECT 
  lt."ReferenceNumber",
  lt."Description",
  lt."TransactionDate"::DATE,
  ROUND(SUM(le."DebitAmount"), 2) AS debit,
  ROUND(SUM(le."CreditAmount"), 2) AS credit
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" = 'STOCK_MOVEMENT'
ORDER BY lt."TransactionDate" DESC
LIMIT 20;
