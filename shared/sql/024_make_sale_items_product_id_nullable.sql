-- Migration: Make sale_items.product_id nullable for custom/service items
-- Date: December 30, 2025
-- Purpose: Allow custom and service items from quotations without real products

-- Make product_id nullable (allows custom/service items)
ALTER TABLE sale_items 
ALTER COLUMN product_id DROP NOT NULL;

-- Add product_name column to store custom item names
ALTER TABLE sale_items 
ADD COLUMN IF NOT EXISTS product_name VARCHAR(255);

-- Add item_type column to distinguish product/service/custom
ALTER TABLE sale_items
ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'product'
CHECK (item_type IN ('product', 'service', 'custom'));

-- Update existing records to populate product_name from products table
UPDATE sale_items si
SET product_name = p.name
FROM products p
WHERE si.product_id = p.id
  AND si.product_name IS NULL;

-- Add index for item_type
CREATE INDEX IF NOT EXISTS idx_sale_items_item_type ON sale_items(item_type);

-- Comment the changes
COMMENT ON COLUMN sale_items.product_id IS 
'UUID of product (NULL for custom/service items from quotations)';

COMMENT ON COLUMN sale_items.product_name IS 
'Product/service name (stored for custom items, joins from products for regular items)';

COMMENT ON COLUMN sale_items.item_type IS 
'Type of item: product (inventory), service (no stock), custom (one-off item)';

-- Log the migration
DO $$
BEGIN
  RAISE NOTICE 'Migration 024 complete: sale_items.product_id is now nullable';
  RAISE NOTICE 'Custom and service items from quotations can now be converted to sales';
END $$;
