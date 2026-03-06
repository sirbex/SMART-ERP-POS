-- ============================================================
-- Migration 052: Pharmacy Features for Uganda/East Africa
-- Features:
--   1. Supplier Price Tracking (supplier_product_prices table)
--   2. Generic/Brand Grouping (generic_name column on products)
--   3. Expiry Enforcement threshold (min_days_before_expiry_sale on products)
--   4. Bonus Stock Handling (is_bonus on goods_receipt_items & inventory_batches)
-- ============================================================

BEGIN;

-- ============================================================
-- 1. SUPPLIER PRICE TRACKING
-- Track last purchase price per supplier per product, auto-updated on GR finalize
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_product_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES suppliers("Id") ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  last_purchase_price NUMERIC(15,4) NOT NULL DEFAULT 0,
  last_purchase_date DATE,
  purchase_count INTEGER NOT NULL DEFAULT 0,
  min_price_seen NUMERIC(15,4),
  max_price_seen NUMERIC(15,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_supplier_product UNIQUE (supplier_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_product_prices_supplier ON supplier_product_prices(supplier_id);
CREATE INDEX IF NOT EXISTS idx_supplier_product_prices_product ON supplier_product_prices(product_id);

-- ============================================================
-- 2. GENERIC / BRAND GROUPING
-- Allows searching products by generic name (e.g. "Amoxicillin" finds all brands)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'generic_name'
  ) THEN
    ALTER TABLE products ADD COLUMN generic_name VARCHAR(255);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_products_generic_name ON products(generic_name);

-- ============================================================
-- 3. EXPIRY ENFORCEMENT ("Do Not Dispense" threshold)
-- Per-product minimum days before expiry to allow sale
-- Products with fewer days remaining are blocked at POS
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'min_days_before_expiry_sale'
  ) THEN
    ALTER TABLE products ADD COLUMN min_days_before_expiry_sale INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Note: Global default threshold is managed in application config.
-- Per-product min_days_before_expiry_sale column provides per-product override.
-- Default value of 0 means "no restriction" unless application sets a global default.

-- ============================================================
-- 4. BONUS STOCK HANDLING
-- Mark GR items and inventory batches as bonus (cost = 0, free goods from supplier)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'goods_receipt_items' AND column_name = 'is_bonus'
  ) THEN
    ALTER TABLE goods_receipt_items ADD COLUMN is_bonus BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'inventory_batches' AND column_name = 'is_bonus'
  ) THEN
    ALTER TABLE inventory_batches ADD COLUMN is_bonus BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

COMMIT;
