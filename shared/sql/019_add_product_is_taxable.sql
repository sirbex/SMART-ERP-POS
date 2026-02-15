-- Migration: Add is_taxable field to products
-- Date: 2025-11-16
-- Description: Add boolean field to track whether a product should have tax calculated

ALTER TABLE products
ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN products.is_taxable IS 'When true, tax_rate must be applied to this product. When false, product price is either tax-inclusive or tax-exempt.';

CREATE INDEX IF NOT EXISTS idx_products_is_taxable ON products(is_taxable);

-- Update existing products to default is_taxable = false
-- This ensures backward compatibility
UPDATE products SET is_taxable = false WHERE is_taxable IS NULL;
