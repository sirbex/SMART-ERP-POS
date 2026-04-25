-- Find completed GRs where batch value > GL debit (missing GL)
SELECT 
  gr.receipt_number,
  ROUND(SUM(b.quantity * b.cost_price), 2) AS total_batch_value,
  COALESCE((
    SELECT ROUND(SUM(le."DebitAmount"), 2)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceNumber" = gr.receipt_number
  ), 0) AS gl_debit,
  ROUND(SUM(b.quantity * b.cost_price), 2) - COALESCE((
    SELECT ROUND(SUM(le."DebitAmount"), 2)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceNumber" = gr.receipt_number
  ), 0) AS gap
FROM goods_receipts gr
JOIN inventory_batches b ON b.goods_receipt_id = gr.id
WHERE gr.status = 'COMPLETED'
GROUP BY gr.id, gr.receipt_number
HAVING ROUND(SUM(b.quantity * b.cost_price), 2) - COALESCE((
    SELECT ROUND(SUM(le."DebitAmount"), 2)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE a."AccountCode" = '1300'
      AND lt."ReferenceNumber" = gr.receipt_number
  ), 0) > 100
ORDER BY gap DESC
LIMIT 20;

-- Also check stock adjustments that added to batches without GL
SELECT 
  'STOCK_ADJUSTMENT_SUMMARY' AS type,
  COUNT(*) AS adj_count,
  ROUND(SUM(b.remaining_quantity * b.cost_price), 2) AS batch_value
FROM inventory_batches b
WHERE b.goods_receipt_id IS NULL
  AND b.remaining_quantity > 0;

-- Check total GL debits vs credits for account 1300 (net balance)
SELECT 
  ROUND(SUM("DebitAmount"), 2) AS total_debits,
  ROUND(SUM("CreditAmount"), 2) AS total_credits,
  ROUND(SUM("DebitAmount") - SUM("CreditAmount"), 2) AS net_balance
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300';
