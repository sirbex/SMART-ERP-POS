-- Compare sale_items COGS vs GL COGS credits to account 1300
SELECT 
  ROUND(SUM(si.unit_cost * si.quantity), 2) AS sale_items_cogs,
  ROUND(SUM(si.unit_cost * (si.quantity - si.refunded_qty)), 2) AS sale_items_cogs_net_refunds
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.status = 'COMPLETED'
  AND si.item_type = 'product';

-- GL COGS credits for account 1300
SELECT 
  ROUND(SUM(le."CreditAmount"), 2) AS gl_cogs_credits
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND lt."ReferenceType" IN ('SALE', 'SALE_COGS');

-- Total batch value across ALL batches (including those from 5 opening GRs)
-- Compare opening GL vs opening batch remaining
SELECT 
  'Opening batches (from 5 GRs)' AS category,
  ROUND(SUM(ROUND(b.remaining_quantity * b.cost_price, 0)), 2) AS remaining_value,
  93613564 AS opening_gl_debit
FROM inventory_batches b
WHERE b.goods_receipt_id IN (
  SELECT id FROM goods_receipts WHERE receipt_number IN ('GR-2026-0001','GR-2026-0002','GR-2026-0003','GR-2026-0004','GR-2026-0005')
)
UNION ALL
SELECT 
  'Post-opening GR batches' AS category,
  ROUND(SUM(ROUND(b.remaining_quantity * b.cost_price, 0)), 2) AS remaining_value,
  23211143 AS gl_debit
FROM inventory_batches b
WHERE b.goods_receipt_id IN (
  SELECT id FROM goods_receipts WHERE receipt_number NOT IN ('GR-2026-0001','GR-2026-0002','GR-2026-0003','GR-2026-0004','GR-2026-0005')
    AND status = 'COMPLETED'
)
UNION ALL
SELECT 
  'UNKNOWN batches (no GR)' AS category,
  ROUND(SUM(ROUND(b.remaining_quantity * b.cost_price, 0)), 2) AS remaining_value,
  1390444 AS stock_movement_gl_debits
FROM inventory_batches b
WHERE b.goods_receipt_id IS NULL AND b.remaining_quantity > 0;
