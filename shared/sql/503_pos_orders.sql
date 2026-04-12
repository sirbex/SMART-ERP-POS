-- Migration 503: SAP-Style Order→Payment POS Flow
-- Adds pos_orders + pos_order_items tables, system setting toggle, sales FK

-- ============================================================
-- 1. Sequence for order number generation (ORD-YYYY-####)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

-- ============================================================
-- 2. POS Orders table (dispenser creates, cashier completes)
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    VARCHAR(50) UNIQUE NOT NULL,

  -- Customer (optional, same as sales)
  customer_id     UUID REFERENCES customers(id),

  -- Financial totals (Decimal precision)
  subtotal        NUMERIC(15,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- Status workflow: PENDING → COMPLETED | CANCELLED
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')),

  -- Who created (dispenser) and optional assigned cashier
  created_by      UUID NOT NULL REFERENCES users(id),
  assigned_cashier_id UUID REFERENCES users(id),

  -- Business date (DATE, not timestamp — follows timezone strategy)
  order_date      DATE NOT NULL,

  notes           TEXT,

  -- Audit timestamps (TIMESTAMPTZ — UTC)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancelled_by    UUID REFERENCES users(id),
  cancel_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_order_number ON pos_orders(order_number);
CREATE INDEX IF NOT EXISTS idx_pos_orders_order_date ON pos_orders(order_date);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created_by ON pos_orders(created_by);

-- ============================================================
-- 3. POS Order Items (mirrors sale_items structure)
-- ============================================================
CREATE TABLE IF NOT EXISTS pos_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id),
  product_name      VARCHAR(255) NOT NULL,
  quantity          NUMERIC(15,4) NOT NULL,
  unit_price        NUMERIC(15,2) NOT NULL,
  line_total        NUMERIC(15,2) NOT NULL,
  discount_amount   NUMERIC(15,2) NOT NULL DEFAULT 0,

  -- UoM snapshot (SAP multi-UoM)
  uom_id            UUID REFERENCES product_uoms(id),
  base_qty          NUMERIC(15,4),
  base_uom_id       UUID REFERENCES product_uoms(id),
  conversion_factor NUMERIC(15,6)
);

CREATE INDEX IF NOT EXISTS idx_pos_order_items_order_id ON pos_order_items(order_id);

-- ============================================================
-- 4. Link sales back to originating order
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'from_order_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN from_order_id UUID REFERENCES pos_orders(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sales_from_order_id ON sales(from_order_id);

-- ============================================================
-- 5. System setting: POS transaction mode toggle
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'system_settings' AND column_name = 'pos_transaction_mode'
  ) THEN
    ALTER TABLE system_settings
      ADD COLUMN pos_transaction_mode VARCHAR(20) NOT NULL DEFAULT 'DirectSale'
      CHECK (pos_transaction_mode IN ('DirectSale', 'OrderToPayment'));
  END IF;
END $$;
