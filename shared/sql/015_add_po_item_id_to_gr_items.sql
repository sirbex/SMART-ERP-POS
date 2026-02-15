-- Add purchase order item reference to goods receipt items
-- This allows tracking which PO line item each GR item fulfills
-- and enables updating received_quantity in purchase_order_items

-- Add po_item_id column
ALTER TABLE goods_receipt_items
  ADD COLUMN IF NOT EXISTS po_item_id UUID REFERENCES purchase_order_items(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_gr_items_po_item ON goods_receipt_items(po_item_id);

-- Note: Existing records will have NULL po_item_id
-- This represents historical data created before this tracking was implemented
-- New goods receipts from POs should populate po_item_id to enable received quantity tracking
