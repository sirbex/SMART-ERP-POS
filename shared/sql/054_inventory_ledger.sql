-- Migration 054: Inventory Ledger & Valuation Layers
-- Purpose: Enterprise movement-ledger architecture — stock derived from SUM(movements)
-- Builds on existing stock_movements table (single source of truth)
-- No data duplication — uses VIEWs over existing data
--
-- Tables/views created:
--   inventory_ledger        VIEW  — signed-quantity ledger over stock_movements
--   valuation_layers        VIEW  — active cost layers with computed total value
--   vw_stock_reconciliation VIEW  — compares ledger-derived stock vs cached quantity
--   fn_ledger_stock_balance()     — returns SUM(signed qty) for a product

-- ============================================================
-- 1. INVENTORY LEDGER VIEW
--    Wraps stock_movements with signed quantities so
--    SELECT SUM(signed_quantity) = current stock
-- ============================================================

CREATE OR REPLACE VIEW inventory_ledger AS
SELECT
  sm.id,
  sm.movement_number,
  sm.product_id,
  sm.batch_id,
  sm.movement_type,
  sm.quantity        AS abs_quantity,
  -- Signed quantity: positive for inbound, negative for outbound
  CASE
    WHEN sm.movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN')
      THEN  sm.quantity
    WHEN sm.movement_type IN ('SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DAMAGE', 'EXPIRY')
      THEN -sm.quantity
    ELSE sm.quantity  -- PHYSICAL_COUNT or unknown — treat as inbound
  END                AS signed_quantity,
  sm.unit_cost,
  -- Movement value (signed)
  CASE
    WHEN sm.movement_type IN ('GOODS_RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN')
      THEN  sm.quantity * COALESCE(sm.unit_cost, 0)
    WHEN sm.movement_type IN ('SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DAMAGE', 'EXPIRY')
      THEN -sm.quantity * COALESCE(sm.unit_cost, 0)
    ELSE sm.quantity * COALESCE(sm.unit_cost, 0)
  END                AS signed_value,
  sm.reference_type,
  sm.reference_id,
  sm.notes,
  sm.created_by_id,
  sm.created_at      AS movement_date
FROM stock_movements sm;

COMMENT ON VIEW inventory_ledger IS
  'Enterprise inventory ledger — stock = SUM(signed_quantity). Built over stock_movements.';

-- ============================================================
-- 2. FUNCTION: Get ledger-derived stock balance for a product
--    This is the "truth" — compare against product_inventory cache
-- ============================================================

CREATE OR REPLACE FUNCTION fn_ledger_stock_balance(p_product_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN movement_type IN ('GOODS_RECEIPT','ADJUSTMENT_IN','TRANSFER_IN','RETURN')
        THEN quantity
      WHEN movement_type IN ('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','DAMAGE','EXPIRY')
        THEN -quantity
      ELSE quantity
    END
  ), 0)
  FROM stock_movements
  WHERE product_id = p_product_id;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION fn_ledger_stock_balance(UUID) IS
  'Returns current stock for a product by summing all signed movements (single source of truth)';

-- ============================================================
-- 3. VALUATION LAYERS VIEW
--    Wraps cost_layers with computed values and lifecycle info
-- ============================================================

CREATE OR REPLACE VIEW valuation_layers AS
SELECT
  cl.id,
  cl.product_id,
  p.name              AS product_name,
  p.sku,
  cl.batch_number,
  cl.quantity          AS original_quantity,
  cl.remaining_quantity,
  cl.quantity - cl.remaining_quantity AS consumed_quantity,
  cl.unit_cost,
  -- Valuations
  cl.remaining_quantity * cl.unit_cost  AS remaining_value,
  cl.quantity * cl.unit_cost            AS original_value,
  (cl.quantity - cl.remaining_quantity) * cl.unit_cost AS consumed_value,
  -- Lifecycle
  cl.received_date,
  cl.is_active,
  CASE
    WHEN cl.remaining_quantity <= 0 THEN 'DEPLETED'
    WHEN cl.remaining_quantity < cl.quantity THEN 'PARTIAL'
    ELSE 'FULL'
  END                 AS layer_status,
  -- Costing method from product
  COALESCE(pv.costing_method, 'FIFO') AS costing_method,
  cl.created_at,
  cl.updated_at
FROM cost_layers cl
JOIN products p ON p.id = cl.product_id
LEFT JOIN product_valuation pv ON pv.product_id = cl.product_id;

COMMENT ON VIEW valuation_layers IS
  'Enterprise valuation layers — FIFO/AVCO cost layers with computed values and lifecycle status';

-- ============================================================
-- 4. STOCK RECONCILIATION VIEW
--    Compares three stock sources: ledger SUM, batch SUM, and cache
--    Discrepancies indicate data corruption or bugs
-- ============================================================

CREATE OR REPLACE VIEW vw_stock_reconciliation AS
SELECT
  p.id              AS product_id,
  p.name            AS product_name,
  p.sku,
  -- Source 1: Ledger (SUM of all signed movements)
  COALESCE(ledger.stock, 0)   AS ledger_stock,
  -- Source 2: Batch aggregation (SUM of remaining_quantity from active batches)
  COALESCE(batch.stock, 0)    AS batch_stock,
  -- Source 3: Cached value in product_inventory
  COALESCE(pi.quantity_on_hand, 0) AS cached_stock,
  -- Discrepancies
  COALESCE(ledger.stock, 0) - COALESCE(batch.stock, 0)      AS ledger_vs_batch_diff,
  COALESCE(batch.stock, 0) - COALESCE(pi.quantity_on_hand, 0) AS batch_vs_cache_diff,
  COALESCE(ledger.stock, 0) - COALESCE(pi.quantity_on_hand, 0) AS ledger_vs_cache_diff,
  -- Is everything in sync?
  CASE
    WHEN ABS(COALESCE(ledger.stock, 0) - COALESCE(batch.stock, 0)) < 0.001
     AND ABS(COALESCE(batch.stock, 0) - COALESCE(pi.quantity_on_hand, 0)) < 0.001
    THEN true
    ELSE false
  END AS is_reconciled,
  -- Movement counts for audit
  COALESCE(ledger.movement_count, 0) AS total_movements,
  ledger.last_movement_date
FROM products p
LEFT JOIN product_inventory pi ON pi.product_id = p.id
LEFT JOIN LATERAL (
  SELECT
    SUM(CASE
      WHEN sm.movement_type IN ('GOODS_RECEIPT','ADJUSTMENT_IN','TRANSFER_IN','RETURN')
        THEN sm.quantity
      WHEN sm.movement_type IN ('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','DAMAGE','EXPIRY')
        THEN -sm.quantity
      ELSE sm.quantity
    END) AS stock,
    COUNT(*) AS movement_count,
    MAX(sm.created_at) AS last_movement_date
  FROM stock_movements sm
  WHERE sm.product_id = p.id
) ledger ON true
LEFT JOIN LATERAL (
  SELECT SUM(b.remaining_quantity) AS stock
  FROM inventory_batches b
  WHERE b.product_id = p.id
    AND b.status = 'ACTIVE'
    AND b.remaining_quantity > 0
) batch ON true
WHERE p.is_active = true;

COMMENT ON VIEW vw_stock_reconciliation IS
  'Three-way reconciliation: ledger SUM vs batch SUM vs cached quantity. Discrepancies indicate data issues.';

-- ============================================================
-- 5. INDEX: Improve performance for ledger SUM aggregate
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_stock_movements_product_type
  ON stock_movements(product_id, movement_type);

CREATE INDEX IF NOT EXISTS idx_stock_movements_created_at
  ON stock_movements(created_at);
