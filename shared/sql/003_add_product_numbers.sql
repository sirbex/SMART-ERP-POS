-- Migration: Add human-readable product numbers
-- Date: November 9, 2025
-- Purpose: Add PROD-0001 style numbers for products

-- ============================================================
-- PRODUCTS - Add product_number field
-- ============================================================

-- Add product_number column
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_number VARCHAR(20) UNIQUE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_product_number ON products(product_number);

-- Create sequence for product numbers
CREATE SEQUENCE IF NOT EXISTS product_number_seq START WITH 1;

-- Function to generate product number
CREATE OR REPLACE FUNCTION generate_product_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.product_number IS NULL THEN
        NEW.product_number := 'PROD-' || LPAD(nextval('product_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate product number
DROP TRIGGER IF EXISTS trigger_generate_product_number ON products;
CREATE TRIGGER trigger_generate_product_number
    BEFORE INSERT ON products
    FOR EACH ROW
    EXECUTE FUNCTION generate_product_number();

-- Update existing products with numbers
WITH numbered_products AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
    FROM products
    WHERE product_number IS NULL
)
UPDATE products p
SET product_number = 'PROD-' || LPAD(nc.row_num::TEXT, 4, '0')
FROM numbered_products nc
WHERE p.id = nc.id;

-- Update sequence to continue from last number
SELECT setval('product_number_seq', (SELECT COUNT(*) FROM products));

-- Verify migration
SELECT 
    COUNT(*) as total_products,
    COUNT(product_number) as products_with_numbers,
    MIN(product_number) as first_number,
    MAX(product_number) as last_number
FROM products;
