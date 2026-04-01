-- ============================================================================
-- Migration 059: Price Rules Seed Data
-- ============================================================================
-- Populates sample pricing rules for the Odoo-style pricing engine.
-- Uses existing customer_groups (Retail, Wholesale) and real products.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Sample Price Rules
-- ============================================================================

-- RULE 1: Wholesale customers get 10% discount on ALL products (global rule)
INSERT INTO price_rules (
    customer_group_id, name, rule_type, value,
    category_id, product_id, min_quantity, priority
)
SELECT
    cg.id,
    'Wholesale 10% Global Discount',
    'discount',
    10.0000,
    NULL,
    NULL,
    1,
    10
FROM customer_groups cg
WHERE cg.name = 'Wholesale Customers'
ON CONFLICT DO NOTHING;

-- RULE 2: Wholesale customers get 15% discount on COSMETICS category (qty >= 5)
INSERT INTO price_rules (
    customer_group_id, name, rule_type, value,
    category_id, product_id, min_quantity, priority
)
SELECT
    cg.id,
    'Wholesale Cosmetics Bulk Discount',
    'discount',
    15.0000,
    pc.id,
    NULL,
    5,
    20
FROM customer_groups cg
CROSS JOIN product_categories pc
WHERE cg.name = 'Wholesale Customers'
  AND pc.name = 'COSMETICS T'
ON CONFLICT DO NOTHING;

-- RULE 3: Wholesale customers get a special multiplier (0.85 = 15% below base) on SUPPLEMENT category
INSERT INTO price_rules (
    customer_group_id, name, rule_type, value,
    category_id, product_id, min_quantity, priority
)
SELECT
    cg.id,
    'Wholesale Supplements 0.85x Multiplier',
    'multiplier',
    0.8500,
    pc.id,
    NULL,
    1,
    15
FROM customer_groups cg
CROSS JOIN product_categories pc
WHERE cg.name = 'Wholesale Customers'
  AND pc.name = 'SUPPLEMENT B'
ON CONFLICT DO NOTHING;

-- RULE 4: Retail customers get 5% discount when buying >= 10 of any product (global)
INSERT INTO price_rules (
    customer_group_id, name, rule_type, value,
    category_id, product_id, min_quantity, priority
)
SELECT
    cg.id,
    'Retail Bulk 5% Discount (qty >= 10)',
    'discount',
    5.0000,
    NULL,
    NULL,
    10,
    5
FROM customer_groups cg
WHERE cg.name = 'Retail Customers'
ON CONFLICT DO NOTHING;

-- RULE 5: Product-specific fixed price for Wholesale on Condoms category
INSERT INTO price_rules (
    customer_group_id, name, rule_type, value,
    category_id, product_id, min_quantity, priority
)
SELECT
    cg.id,
    'Wholesale Condoms Category Discounted Rate',
    'discount',
    20.0000,
    pc.id,
    NULL,
    1,
    25
FROM customer_groups cg
CROSS JOIN product_categories pc
WHERE cg.name = 'Wholesale Customers'
  AND pc.name = 'CONDOMS'
ON CONFLICT DO NOTHING;

COMMIT;
