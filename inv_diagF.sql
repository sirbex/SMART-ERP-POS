-- Per-batch reconciliation: compare SM-derived expected remaining vs actual remaining_quantity
WITH batch_sm AS (
  SELECT 
    sm.batch_id,
    ROUND(SUM(CASE WHEN sm.movement_type::text IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN') 
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 4) AS sm_inflow_cost,
    ROUND(SUM(CASE WHEN sm.movement_type::text = 'SALE' 
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 4) AS sm_sale_cost,
    ROUND(SUM(CASE WHEN sm.movement_type::text = 'ADJUSTMENT_OUT' 
                   THEN sm.quantity * COALESCE(sm.unit_cost,0) ELSE 0 END), 4) AS sm_adjout_cost,
    ROUND(SUM(CASE WHEN sm.movement_type::text = 'SUPPLIER_RETURN' 
                   THEN ABS(sm.quantity * COALESCE(sm.unit_cost,0)) ELSE 0 END), 4) AS sm_return_cost,
    SUM(CASE WHEN sm.movement_type::text IN ('GOODS_RECEIPT','OPENING_BALANCE','ADJUSTMENT_IN')
             THEN sm.quantity ELSE 0 END) AS sm_inflow_qty,
    SUM(CASE WHEN sm.movement_type::text = 'SALE' THEN sm.quantity ELSE 0 END) AS sm_sale_qty,
    SUM(CASE WHEN sm.movement_type::text = 'ADJUSTMENT_OUT' THEN sm.quantity ELSE 0 END) AS sm_adjout_qty,
    SUM(CASE WHEN sm.movement_type::text = 'SUPPLIER_RETURN' THEN ABS(sm.quantity) ELSE 0 END) AS sm_return_qty
  FROM stock_movements sm
  WHERE sm.batch_id IS NOT NULL
  GROUP BY sm.batch_id
)
SELECT 
  b.id AS batch_id,
  p.name AS product_name,
  b.remaining_quantity AS actual_remaining_qty,
  b.cost_price,
  ROUND(b.remaining_quantity * b.cost_price, 4) AS actual_remaining_cost,
  COALESCE(bsm.sm_inflow_qty, 0) - COALESCE(bsm.sm_sale_qty, 0) - COALESCE(bsm.sm_adjout_qty, 0) - COALESCE(bsm.sm_return_qty, 0) AS sm_expected_qty,
  b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty, 0) - COALESCE(bsm.sm_sale_qty, 0) - COALESCE(bsm.sm_adjout_qty, 0) - COALESCE(bsm.sm_return_qty, 0)) AS qty_discrepancy,
  ROUND((b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty, 0) - COALESCE(bsm.sm_sale_qty, 0) - COALESCE(bsm.sm_adjout_qty, 0) - COALESCE(bsm.sm_return_qty, 0))) * b.cost_price, 2) AS cost_discrepancy
FROM inventory_batches b
JOIN products p ON p.id = b.product_id
LEFT JOIN batch_sm bsm ON bsm.batch_id = b.id
WHERE b.remaining_quantity > 0
  AND ABS(b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty, 0) - COALESCE(bsm.sm_sale_qty, 0) - COALESCE(bsm.sm_adjout_qty, 0) - COALESCE(bsm.sm_return_qty, 0))) > 0.01
ORDER BY ABS(ROUND((b.remaining_quantity - (COALESCE(bsm.sm_inflow_qty, 0) - COALESCE(bsm.sm_sale_qty, 0) - COALESCE(bsm.sm_adjout_qty, 0) - COALESCE(bsm.sm_return_qty, 0))) * b.cost_price, 2)) DESC
LIMIT 30;
