-- 1. Confirm GL 1300 balance vs subledger (proper column names)
SELECT
  'GL 1300 (ledger_entries)' AS source,
  ROUND(COALESCE(SUM(CASE WHEN le."EntryType"='DEBIT' THEN le."Amount" ELSE -le."Amount" END),0),2) AS balance
FROM ledger_entries le
JOIN accounts a ON a."Id"=le."AccountId"
WHERE a."AccountCode"='1300'
UNION ALL
SELECT
  'inventory_batches subledger',
  ROUND(COALESCE(SUM(remaining_quantity * COALESCE(cost_price,0)),0),2)
FROM inventory_batches WHERE remaining_quantity>0;

-- 2. GL 1300 net impact broken down by LedgerTransaction description (top sources)
SELECT
  lt."Description",
  lt."TransactionType",
  COUNT(*) AS entries,
  ROUND(SUM(CASE WHEN le."EntryType"='DEBIT' THEN le."Amount" ELSE -le."Amount" END),2) AS net_impact
FROM ledger_entries le
JOIN accounts a ON a."Id"=le."AccountId"
JOIN ledger_transactions lt ON lt."Id"=le."TransactionId"
WHERE a."AccountCode"='1300'
GROUP BY lt."Description", lt."TransactionType"
ORDER BY ABS(SUM(CASE WHEN le."EntryType"='DEBIT' THEN le."Amount" ELSE -le."Amount" END)) DESC
LIMIT 20;

-- 3. Check ledger_transactions columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ledger_transactions'
ORDER BY ordinal_position;

-- 4. Zero-cost batches detail with product names (these reduce subledger vs GL)
SELECT
  p.name AS product, ib.batch_number, ib.remaining_quantity, ib.cost_price,
  ib.created_at::date AS batch_date
FROM inventory_batches ib
JOIN products p ON p.id=ib.product_id
WHERE ib.remaining_quantity>0
  AND (ib.cost_price IS NULL OR ib.cost_price=0)
ORDER BY ib.created_at;

-- 5. Opening stock GL entries (what was the GL posting when those IMP-INIT batches were created)
SELECT
  p.name AS product, sm.movement_type, sm.quantity, sm.unit_cost,
  ROUND(sm.quantity*COALESCE(sm.unit_cost,0),2) AS stock_value,
  sm.reference_type, sm.notes, sm.created_at::date
FROM stock_movements sm
JOIN products p ON p.id=sm.product_id
WHERE sm.reference_type IN ('IMPORT','OPENING_STOCK','ADJUSTMENT')
  AND sm.created_at >= '2026-04-01'
ORDER BY sm.created_at DESC
LIMIT 30;
