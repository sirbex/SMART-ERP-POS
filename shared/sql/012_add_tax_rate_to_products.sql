-- Migration: Add tax_rate to products
-- Purpose: Align backend schema with frontend field taxRate
-- Date: 2025-11-03

ALTER TABLE products 
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(5,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN products.tax_rate IS 'Tax rate percentage (0-100) for this product';

CREATE INDEX IF NOT EXISTS idx_products_tax_rate ON products(tax_rate);
