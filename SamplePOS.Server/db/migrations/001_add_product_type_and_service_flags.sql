-- Migration: Add product type and service flags
-- Date: November 23, 2025
-- Purpose: Support service (non-inventory) products

-- Add product_type column with constraint
ALTER TABLE products 
ADD COLUMN product_type VARCHAR(20) 
CHECK (product_type IN ('inventory', 'consumable', 'service')) 
DEFAULT 'inventory' NOT NULL;

-- Add income account reference for services (optional - only if accounts table exists)
-- ALTER TABLE products 
-- ADD COLUMN income_account_id UUID NULL 
-- REFERENCES accounts(id) ON DELETE SET NULL;
-- Uncomment above when accounts table is created

-- Add computed column for easy service identification
ALTER TABLE products 
ADD COLUMN is_service BOOLEAN 
GENERATED ALWAYS AS (product_type = 'service') STORED;

-- Create index for service filtering
CREATE INDEX idx_products_product_type ON products(product_type);
CREATE INDEX idx_products_is_service ON products(is_service) WHERE is_service = true;

-- Update existing products to inventory type (already default)
-- No data migration needed as DEFAULT handles new rows

-- Add comment
COMMENT ON COLUMN products.product_type IS 'Product type: inventory (track stock), consumable (track but expensed), service (no stock tracking)';
COMMENT ON COLUMN products.is_service IS 'Computed: true when product_type = service';
-- COMMENT ON COLUMN products.income_account_id IS 'Revenue account for service products';
