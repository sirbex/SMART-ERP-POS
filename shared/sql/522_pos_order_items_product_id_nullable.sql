-- Migration 522: pos_order_items.product_id nullable for service/custom lines (align sale_items + held orders)

DO $$
BEGIN
  ALTER TABLE pos_order_items ALTER COLUMN product_id DROP NOT NULL;

  COMMENT ON COLUMN pos_order_items.product_id IS
    'UUID of product (NULL for custom/service POS lines). FK to products(id).';

  RAISE NOTICE 'Migration 522: pos_order_items.product_id is nullable for service/custom items';
END $$;
