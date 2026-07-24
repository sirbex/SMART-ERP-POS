-- Migration 567: Restaurant menu categories appear on POS
--
-- Fixes:
-- 1) Link products.category free-text → products.category_id (FOH joins on category_id)
-- 2) Switch available_in_restaurant to opt-out (default TRUE) so categorized products
--    show on Restaurant POS. Uncheck "Available in Restaurant" to hide a SKU.
--
-- Requires 560.

-- Link category_id from free-text name
UPDATE products p
SET category_id = c.id
FROM product_categories c
WHERE p.category_id IS NULL
  AND p.category IS NOT NULL
  AND TRIM(p.category) <> ''
  AND LOWER(TRIM(p.category)) = LOWER(TRIM(c.name));

-- Opt-out model: put existing active products on the restaurant menu
UPDATE products
SET available_in_restaurant = TRUE
WHERE COALESCE(is_active, TRUE) = TRUE
  AND available_in_restaurant = FALSE;

ALTER TABLE products
  ALTER COLUMN available_in_restaurant SET DEFAULT TRUE;

COMMENT ON COLUMN products.available_in_restaurant IS
  'Restaurant FOH: TRUE = show on menu (default). FALSE = hide from restaurant POS.';

INSERT INTO schema_version (version) VALUES (567) ON CONFLICT DO NOTHING;
