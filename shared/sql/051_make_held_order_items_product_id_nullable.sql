-- Migration 051: Make pos_held_order_items.product_id nullable for service/custom items
-- Mirrors migration 024 which made sale_items.product_id nullable
-- Service items (custom_svc_*) have no real product in the products table

DO $$
BEGIN
  -- 1. Drop the NOT NULL constraint on product_id
  -- product_id is UUID REFERENCES products(id) ON DELETE CASCADE
  -- Service/custom items don't have a product_id
  ALTER TABLE pos_held_order_items ALTER COLUMN product_id DROP NOT NULL;

  -- 2. Add comment explaining nullable usage
  COMMENT ON COLUMN pos_held_order_items.product_id IS 
    'UUID of product (NULL for custom/service items). FK to products(id).';

  RAISE NOTICE 'Migration 051 complete: pos_held_order_items.product_id is now nullable for service items';
END $$;
