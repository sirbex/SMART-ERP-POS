-- Add UOM tracking to purchase_order_items
-- This allows tracking which UOM (box, piece, etc.) was used when ordering

-- Add uom_id column to purchase_order_items
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS uom_id UUID REFERENCES uoms(id) ON DELETE RESTRICT;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_po_items_uom ON purchase_order_items(uom_id);

-- Note: Existing records will have NULL uom_id
-- This represents historical data before UOM tracking was implemented
-- New purchase orders should always populate uom_id
