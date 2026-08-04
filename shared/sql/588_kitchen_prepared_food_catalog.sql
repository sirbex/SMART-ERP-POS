-- Migration 588: Kitchen Production Phase 2 — Prepared food catalog + recipe usage mode
-- Odoo mapping: AT_SALE ≈ Kit BOM; AT_PRODUCTION ≈ Manufacture BoM (produce then sell parent).
-- Default AT_SALE preserves Phase 3 restaurant cook-to-order behavior for existing recipes.

-- ============================================================
-- 1. Recipe usage mode (when ingredients are consumed)
-- ============================================================
ALTER TABLE product_recipes
  ADD COLUMN IF NOT EXISTS usage_mode VARCHAR(20) NOT NULL DEFAULT 'AT_SALE';

DO $$
BEGIN
  ALTER TABLE product_recipes
    DROP CONSTRAINT IF EXISTS chk_product_recipes_usage_mode;
  ALTER TABLE product_recipes
    ADD CONSTRAINT chk_product_recipes_usage_mode
    CHECK (usage_mode IN ('AT_SALE', 'AT_PRODUCTION'));
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

COMMENT ON COLUMN product_recipes.usage_mode IS
  'AT_SALE = explode ingredients on createSale (cook-to-order Kit). '
  'AT_PRODUCTION = BOM for kitchen production only; sale deducts finished parent (cook-to-stock).';

-- ============================================================
-- 2. Prepared food catalog flag (normal inventory product marker)
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_prepared_food BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_is_prepared_food
  ON products (is_prepared_food)
  WHERE is_prepared_food = TRUE;

COMMENT ON COLUMN products.is_prepared_food IS
  'Kitchen Production Phase 2: product is finished/semi-finished food produced by kitchen '
  '(still product_type inventory|consumable). Helps catalog and production filters.';

INSERT INTO schema_version (version) VALUES (588) ON CONFLICT DO NOTHING;
