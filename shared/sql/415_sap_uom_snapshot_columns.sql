-- Migration 415: SAP-grade UoM snapshot columns
-- =============================================================================
-- SAP S/4HANA Rule: Every transactional line permanently remembers
--   1. What the user entered (entered_qty, entered_uom_id)
--   2. What the system used internally (base_qty, base_uom_id)
--   3. The conversion rate at posting time (conversion_factor)
--
-- History must NEVER depend on current master data.
-- Master data may change. Transactions must be self-describing forever.
-- =============================================================================

-- ─── sale_items ─────────────────────────────────────────────────────────────
-- quantity = entered_qty (what user typed, in the selected UoM)
-- uom_id  = entered_uom_id (already exists)
-- NEW: base_qty, base_uom_id, conversion_factor

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS base_qty DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS conversion_factor DECIMAL(15, 6) NOT NULL DEFAULT 1;

COMMENT ON COLUMN sale_items.base_qty IS 'Quantity in product base unit at posting time (SAP MEINS). NULL = legacy row or base-unit sale';
COMMENT ON COLUMN sale_items.base_uom_id IS 'Product base UoM at posting time. NULL = legacy row';
COMMENT ON COLUMN sale_items.conversion_factor IS 'Snapshot of conversion factor at posting time: base_qty = quantity * conversion_factor';

-- ─── purchase_order_items ───────────────────────────────────────────────────
-- ordered_quantity = entered_qty
-- uom_id           = entered_uom_id (already exists)
-- NEW: base_qty, base_uom_id, conversion_factor

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS base_qty DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS conversion_factor DECIMAL(15, 6) NOT NULL DEFAULT 1;

COMMENT ON COLUMN purchase_order_items.base_qty IS 'Ordered quantity in product base unit at posting time';
COMMENT ON COLUMN purchase_order_items.base_uom_id IS 'Product base UoM at posting time';
COMMENT ON COLUMN purchase_order_items.conversion_factor IS 'Snapshot of conversion factor at posting time';

-- ─── goods_receipt_items ────────────────────────────────────────────────────
-- received_quantity = entered_qty
-- uom_id            = entered_uom_id (already exists)
-- NEW: base_qty, base_uom_id, conversion_factor

ALTER TABLE goods_receipt_items
  ADD COLUMN IF NOT EXISTS base_qty DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS conversion_factor DECIMAL(15, 6) NOT NULL DEFAULT 1;

COMMENT ON COLUMN goods_receipt_items.base_qty IS 'Received quantity in product base unit at posting time';
COMMENT ON COLUMN goods_receipt_items.base_uom_id IS 'Product base UoM at posting time';
COMMENT ON COLUMN goods_receipt_items.conversion_factor IS 'Snapshot of conversion factor at posting time';

-- ─── stock_movements ────────────────────────────────────────────────────────
-- quantity = already in base units (this is correct and stays)
-- uom_id   = entered_uom_id (already exists but rarely populated)
-- NEW: entered_qty, base_uom_id, conversion_factor

ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS entered_qty DECIMAL(15, 4),
  ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS conversion_factor DECIMAL(15, 6) NOT NULL DEFAULT 1;

COMMENT ON COLUMN stock_movements.entered_qty IS 'Original user-entered quantity before base conversion. NULL = legacy or already-base-unit entry';
COMMENT ON COLUMN stock_movements.quantity IS 'Quantity in product base unit (unchanged — always base)';
COMMENT ON COLUMN stock_movements.base_uom_id IS 'Product base UoM at posting time';
COMMENT ON COLUMN stock_movements.conversion_factor IS 'Snapshot: quantity = entered_qty * conversion_factor. Default 1 = no conversion';

-- ─── Indexes for reporting ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sale_items_base_uom ON sale_items(base_uom_id) WHERE base_uom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_items_base_uom ON purchase_order_items(base_uom_id) WHERE base_uom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gr_items_base_uom ON goods_receipt_items(base_uom_id) WHERE base_uom_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movements_base_uom ON stock_movements(base_uom_id) WHERE base_uom_id IS NOT NULL;
