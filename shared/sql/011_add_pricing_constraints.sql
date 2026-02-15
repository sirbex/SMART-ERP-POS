-- ============================================================
-- Migration: Add Pricing Constraints Columns
-- Description: Add min_price and max_discount_percentage to products table
-- Date: 2025-11-02
-- ============================================================

-- Add min_price column (minimum selling price enforcement)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS min_price DECIMAL(15, 2) DEFAULT NULL;

-- Add max_discount_percentage column (maximum discount limit)
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS max_discount_percentage DECIMAL(5, 2) DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN products.min_price IS 'Minimum allowed selling price for this product (optional)';
COMMENT ON COLUMN products.max_discount_percentage IS 'Maximum discount percentage allowed (optional, e.g., 20.00 for 20%)';

-- Create index for min_price lookups (used in sales validation)
CREATE INDEX IF NOT EXISTS idx_products_min_price ON products(min_price) WHERE min_price IS NOT NULL;
