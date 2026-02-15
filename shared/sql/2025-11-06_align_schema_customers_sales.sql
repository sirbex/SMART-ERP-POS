-- Schema Alignment Migration: Customers/Sales/Cost Layers
-- Date: 2025-11-06
-- Purpose: Ensure database columns match repository/service code expectations
-- Notes: All changes are idempotent and use IF NOT EXISTS guards

-- 1) cost_layers: add missing columns used by services (goods_receipt_id, updated_at)
ALTER TABLE IF EXISTS cost_layers
  ADD COLUMN IF NOT EXISTS goods_receipt_id UUID NULL REFERENCES goods_receipts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- Indexes for cost_layers
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_cost_layers_goods_receipt' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_cost_layers_goods_receipt ON cost_layers(goods_receipt_id) WHERE goods_receipt_id IS NOT NULL;
  END IF;
END$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'idx_cost_layers_active_remaining' AND n.nspname = 'public'
  ) THEN
    CREATE INDEX idx_cost_layers_active_remaining ON cost_layers(is_active, remaining_quantity) 
      WHERE is_active = TRUE AND remaining_quantity > 0;
  END IF;
END$$;

-- Update trigger for updated_at on cost_layers (create if missing)
CREATE OR REPLACE FUNCTION update_cost_layers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_cost_layers_updated_at'
  ) THEN
    CREATE TRIGGER trg_cost_layers_updated_at
      BEFORE UPDATE ON cost_layers
      FOR EACH ROW
      EXECUTE FUNCTION update_cost_layers_updated_at();
  END IF;
END$$;

-- 2) users: ensure full_name column exists (used by customer sales queries)
ALTER TABLE IF EXISTS users
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- 3) sales: ensure expected columns exist (safeguard for older schemas)
ALTER TABLE IF EXISTS sales
  ADD COLUMN IF NOT EXISTS sale_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS change_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS cashier_id UUID NULL REFERENCES users(id);

-- 4) sale_items: ensure expected columns exist (unit_cost, total_price)
ALTER TABLE IF EXISTS sale_items
  ADD COLUMN IF NOT EXISTS unit_cost DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS total_price DECIMAL(15,2) NOT NULL DEFAULT 0.00;

-- 5) inventory_batches link columns already handled by 2025-11-04_add_batch_links.sql
-- No action here

-- Verification comments
COMMENT ON EXTENSION "uuid-ossp" IS 'Required for UUID generation if used in initial schema';
