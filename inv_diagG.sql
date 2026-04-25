-- 1. Total net batch cost discrepancy (all batches)
WITH batch_sm AS (
  SELECT 
    sm.batch_id,
    SUM(CASE WHEN sm.movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN') 
             THEN sm.quantity ELSE 0 END) AS sm_inflow_qty,
    SUM(CASE WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT') 
             THEN sm.quantity ELSE 0 END) AS sm_outflow_qty,
    SUM(CASE WHEN sm.movement_type = 'SUPPLIER_RETURN' 
             THEN ABS(sm.quantity) ELSE 0 END) AS sm_return_qty
  FROM stock_movements sm
  WHERE sm.batch_id IS NOT NULL
  GROUP BY sm.batch_id
)
SELECT
  COUNT(*) AS discrepant_batches,
  ROUND(SUM((b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) * b.cost_price), 2) AS total_cost_discrepancy,
  ROUND(SUM(CASE WHEN (b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) > 0 
            THEN (b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) * b.cost_price ELSE 0 END), 2) AS positive_discrepancies,
  ROUND(SUM(CASE WHEN (b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) < 0 
            THEN (b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) * b.cost_price ELSE 0 END), 2) AS negative_discrepancies
FROM inventory_batches b
JOIN batch_sm bsm ON bsm.batch_id = b.id
WHERE ABS(b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) > 0.001;

-- 2. Investigate SALE-2026-0448 (GL vs SM gap = +20,001)
SELECT 
  s.sale_number, s.status, s.sale_date,
  si.product_name, si.quantity, si.unit_cost, si.unit_price
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
WHERE s.sale_number = 'SALE-2026-0448'
ORDER BY si.product_name;

-- 3. SM records for SALE-2026-0448
SELECT sm.movement_number, sm.movement_type, sm.quantity, sm.unit_cost, 
  sm.batch_id, p.name AS product_name
FROM sales s
JOIN stock_movements sm ON sm.reference_id = s.id AND sm.reference_type = 'SALE'
JOIN products p ON p.id = sm.product_id
WHERE s.sale_number = 'SALE-2026-0448';

-- 4. GL entry for SALE-2026-0448
SELECT lt."ReferenceType", lt."ReferenceNumber", lt."Description",
  ROUND(le."DebitAmount",2) AS debit, ROUND(le."CreditAmount",2) AS credit,
  a."AccountCode", a."AccountName"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE lt."ReferenceNumber" = 'SALE-2026-0448'
ORDER BY a."AccountCode";

-- 5. Check if batch discrepancy batches are mainly from SALE_COGS sales
-- Find which sales created stock movements for the discrepant batches
WITH discrepant_batches AS (
  SELECT b.id AS batch_id, b.cost_price,
    b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0)) AS qty_disc
  FROM inventory_batches b
  JOIN (
    SELECT batch_id,
      SUM(CASE WHEN movement_type IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN') THEN quantity ELSE 0 END) AS sm_inflow_qty,
      SUM(CASE WHEN movement_type IN ('SALE','ADJUSTMENT_OUT') THEN quantity ELSE 0 END) AS sm_outflow_qty,
      SUM(CASE WHEN movement_type = 'SUPPLIER_RETURN' THEN ABS(quantity) ELSE 0 END) AS sm_return_qty
    FROM stock_movements WHERE batch_id IS NOT NULL GROUP BY batch_id
  ) bsm ON bsm.batch_id = b.id
  WHERE ABS(b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty,0) - COALESCE(bsm.sm_outflow_qty,0) - COALESCE(bsm.sm_return_qty,0))) > 0.001
    AND b.cost_price > 0
)
SELECT db.batch_id, db.qty_disc, db.cost_price, ROUND(db.qty_disc * db.cost_price, 2) AS cost_disc
FROM discrepant_batches db
ORDER BY ABS(ROUND(db.qty_disc * db.cost_price, 2)) DESC;
