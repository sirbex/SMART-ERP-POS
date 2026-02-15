-- Add UOM tracking to transaction tables
-- This migration adds uom_id columns to goods_receipt_items, sale_items, and stock_movements
-- to track which specific UOM was used in each transaction

-- 1) Add uom_id to goods_receipt_items
ALTER TABLE goods_receipt_items
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_gr_items_uom ON goods_receipt_items(uom_id);

-- 2) Add uom_id to sale_items  
ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_sale_items_uom ON sale_items(uom_id);

-- 3) Add uom_id to stock_movements
ALTER TABLE stock_movements
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_movements_uom ON stock_movements(uom_id);

-- Note: Existing records will have NULL uom_id
-- This is acceptable as they represent historical data before UOM tracking was implemented
-- New transactions should always populate uom_id
