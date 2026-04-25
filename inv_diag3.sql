-- Check newer GRs (post-opening) that might have GL vs batch mismatches
SELECT 
  gr.receipt_number,
  gr.received_date::DATE,
  ROUND(SUM(b.quantity * b.cost_price), 2) AS original_batch_value,
  ROUND(SUM(b.remaining_quantity * b.cost_price), 2) AS remaining_batch_value,
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
GROUP BY gr.id, gr.receipt_number, gr.received_date
ORDER BY gr.received_date DESC
LIMIT 30;

-- Check stock adjustments that added inventory - do they have GL?
SELECT
  sm.movement_number,
  sm.movement_type,
  sm.movement_date::DATE,
  ROUND(sm.quantity * sm.unit_cost, 2) AS movement_value,
  COALESCE((
    SELECT ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceNumber" = sm.movement_number
  ), 0) AS gl_net
FROM stock_movements sm
WHERE sm.movement_type IN ('ADJUSTMENT_IN', 'OPENING_STOCK', 'TRANSFER_IN')
  AND sm.unit_cost > 0
ORDER BY sm.movement_date DESC
LIMIT 20;

-- What reference types have GL entries for 1300 (and their totals)?
SELECT 
  lt."ReferenceType",
  COUNT(DISTINCT lt."Id") AS transaction_count,
  ROUND(SUM(le."DebitAmount"), 2) AS total_debits,
  ROUND(SUM(le."CreditAmount"), 2) AS total_credits,
  ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2) AS net
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
GROUP BY lt."ReferenceType"
ORDER BY ABS(SUM(le."DebitAmount") - SUM(le."CreditAmount")) DESC;
