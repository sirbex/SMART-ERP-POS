-- ============================================================================
-- Migration 501: Product Procurement Columns
--
-- Adds procurement intelligence fields to products table:
--   preferred_supplier_id  – default supplier for reorder
--   supplier_product_code  – supplier's internal code for this product
--   purchase_uom_id        – default UoM for purchasing
--   reorder_quantity       – standard reorder qty (moved to product_inventory)
--   lead_time_days         – supplier lead time in days
--
-- SAFE: Additive – no columns dropped, no data changed.
-- ============================================================================

BEGIN;

-- ── Products table: procurement fields ──
ALTER TABLE products ADD COLUMN IF NOT EXISTS preferred_supplier_id UUID REFERENCES suppliers("Id") ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier_product_code TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS purchase_uom_id UUID REFERENCES uoms(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NOT NULL DEFAULT 0;

-- ── product_inventory: reorder_quantity ──
ALTER TABLE product_inventory ADD COLUMN IF NOT EXISTS reorder_quantity DECIMAL(15,4) NOT NULL DEFAULT 0;

-- ── Indexes for procurement search ──
CREATE INDEX IF NOT EXISTS idx_products_preferred_supplier ON products (preferred_supplier_id) WHERE preferred_supplier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_supplier_product_code ON products (supplier_product_code) WHERE supplier_product_code IS NOT NULL;

-- Update schema version
INSERT INTO schema_migrations (version, name, applied_at)
VALUES (501, '501_product_procurement_columns', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
