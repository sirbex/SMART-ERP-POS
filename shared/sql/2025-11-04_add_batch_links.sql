-- Add linkage fields to inventory_batches for tracing batches to PO/GR items
-- Safe to run multiple times

ALTER TABLE IF EXISTS inventory_batches
  ADD COLUMN IF NOT EXISTS goods_receipt_id UUID NULL,
  ADD COLUMN IF NOT EXISTS goods_receipt_item_id UUID NULL,
  ADD COLUMN IF NOT EXISTS purchase_order_id UUID NULL,
  ADD COLUMN IF NOT EXISTS purchase_order_item_id UUID NULL;

-- Optional indexes to speed up lookups
CREATE INDEX IF NOT EXISTS idx_batches_gr_id ON inventory_batches (goods_receipt_id);
CREATE INDEX IF NOT EXISTS idx_batches_gr_item_id ON inventory_batches (goods_receipt_item_id);
CREATE INDEX IF NOT EXISTS idx_batches_po_id ON inventory_batches (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_batches_po_item_id ON inventory_batches (purchase_order_item_id);

-- Add foreign keys if the referenced tables exist
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipts') THEN
    BEGIN
      ALTER TABLE inventory_batches
        ADD CONSTRAINT IF NOT EXISTS fk_batches_gr
        FOREIGN KEY (goods_receipt_id) REFERENCES goods_receipts(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'goods_receipt_items') THEN
    BEGIN
      ALTER TABLE inventory_batches
        ADD CONSTRAINT IF NOT EXISTS fk_batches_gr_item
        FOREIGN KEY (goods_receipt_item_id) REFERENCES goods_receipt_items(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_orders') THEN
    BEGIN
      ALTER TABLE inventory_batches
        ADD CONSTRAINT IF NOT EXISTS fk_batches_po
        FOREIGN KEY (purchase_order_id) REFERENCES purchase_orders(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'purchase_order_items') THEN
    BEGIN
      ALTER TABLE inventory_batches
        ADD CONSTRAINT IF NOT EXISTS fk_batches_po_item
        FOREIGN KEY (purchase_order_item_id) REFERENCES purchase_order_items(id) ON DELETE SET NULL;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;