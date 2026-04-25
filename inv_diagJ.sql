-- Investigate Glucophage batch (largest discrepancy) and VOID SM batch_id pattern

-- 1. All SM records for Glucophage batch BATCH-20260415-013
SELECT sm.movement_number, sm.movement_type, sm.reference_type, sm.reference_id,
  sm.quantity, sm.unit_cost, sm.batch_id IS NOT NULL AS has_batch,
  sm.created_at::DATE AS sm_date
FROM stock_movements sm
JOIN inventory_batches b ON b.product_id = sm.product_id
WHERE b.id = (SELECT id FROM inventory_batches WHERE batch_number = 'BATCH-20260415-013' LIMIT 1)
ORDER BY sm.created_at;

-- 2. Are there ANY SM records with batch_id = the Glucophage batch?
SELECT sm.movement_number, sm.movement_type, sm.reference_type,
  sm.quantity, sm.unit_cost
FROM stock_movements sm
WHERE sm.batch_id = (SELECT id FROM inventory_batches WHERE batch_number = 'BATCH-20260415-013' LIMIT 1);

-- 3. What's the Glucophage batch detail?
SELECT b.id, b.batch_number, b.quantity, b.remaining_quantity, b.cost_price,
  b.goods_receipt_id, b.source_type, b.received_date, b.status,
  gr.receipt_number
FROM inventory_batches b
LEFT JOIN goods_receipts gr ON gr.id = b.goods_receipt_id
WHERE b.batch_number = 'BATCH-20260415-013';

-- 4. All VOID SM records: do they have batch_id set?
SELECT sm.movement_number, sm.reference_type, sm.quantity, sm.unit_cost,
  sm.batch_id IS NOT NULL AS has_batch_id, sm.batch_id,
  sm.reference_id
FROM stock_movements sm
WHERE sm.reference_type = 'VOID'
ORDER BY sm.created_at;

-- 5. Total per-batch fake discrepancy from VOID SMs (batch_id=NULL)
-- For each VOID SM without batch_id: how much did the code restore to the batch?
SELECT 
  COUNT(*) AS void_sms_no_batch,
  ROUND(SUM(sm.quantity * COALESCE(sm.unit_cost, 0)), 2) AS void_no_batch_cost
FROM stock_movements sm
WHERE sm.reference_type = 'VOID' AND sm.batch_id IS NULL;
