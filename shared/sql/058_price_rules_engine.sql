-- ============================================================================
-- Migration 058: Odoo-Style Price Rules Engine
-- ============================================================================
-- Adds category-level and global pricing rules tied to customer groups.
-- Integrates with the existing pricing_tiers (product-level) system.
--
-- Resolution priority:
--   1. Product-specific pricing_tier (existing)
--   2. Category-specific price_rule (NEW)
--   3. Global price_rule (category_id IS NULL) (NEW)
--   4. Customer group flat discount (existing customer_groups.discount_percentage)
--   5. Product pricing_formula (existing)
--   6. Base selling_price fallback (existing)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Product Categories lookup table
--    Normalises the free-text products.category into a first-class entity.
-- ============================================================================
CREATE TABLE IF NOT EXISTS product_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_categories_name
    ON product_categories (name);

-- Back-fill from existing products.category values
INSERT INTO product_categories (name)
SELECT DISTINCT category
FROM products
WHERE category IS NOT NULL
  AND TRIM(category) != ''
ON CONFLICT (name) DO NOTHING;

-- Add FK column for normalised category
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);

-- Populate category_id from existing free-text category
UPDATE products p
SET category_id = pc.id
FROM product_categories pc
WHERE pc.name = p.category
  AND p.category_id IS NULL;

-- ============================================================================
-- 2. Price Rules table (Odoo Pricelist Rules equivalent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS price_rules (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_group_id UUID NOT NULL REFERENCES customer_groups(id) ON DELETE CASCADE,
    name              VARCHAR(255),
    rule_type         VARCHAR(20) NOT NULL CHECK (rule_type IN ('multiplier', 'discount', 'fixed', 'formula')),
    value             DECIMAL(15, 4) NOT NULL,
    category_id       UUID REFERENCES product_categories(id) ON DELETE CASCADE,
    product_id        UUID REFERENCES products(id) ON DELETE CASCADE,
    min_quantity      DECIMAL(15, 4) NOT NULL DEFAULT 1.0000,
    valid_from        DATE,
    valid_until       DATE,
    priority          INTEGER NOT NULL DEFAULT 0,
    is_active         BOOLEAN NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- A rule targets EITHER a category, a product, or neither (global). Not both.
    CONSTRAINT chk_price_rule_scope
        CHECK (NOT (category_id IS NOT NULL AND product_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_price_rules_group      ON price_rules (customer_group_id);
CREATE INDEX IF NOT EXISTS idx_price_rules_category    ON price_rules (category_id);
CREATE INDEX IF NOT EXISTS idx_price_rules_product     ON price_rules (product_id);
CREATE INDEX IF NOT EXISTS idx_price_rules_active      ON price_rules (is_active, customer_group_id);

COMMENT ON TABLE price_rules IS 'Odoo-style pricelist rules: multiplier/discount/fixed/formula applied by customer group at product, category, or global scope';
COMMENT ON COLUMN price_rules.rule_type IS 'multiplier: base × value | discount: base × (1 − value/100) | fixed: value as final price | formula: VM2 expression in value column';
COMMENT ON COLUMN price_rules.priority IS 'Higher priority wins when multiple rules match';

COMMIT;
