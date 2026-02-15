-- Automatic population of po_item_id when creating goods receipt items
-- This PREVENTS the issue where GR items don't link to PO items
-- Trigger runs BEFORE INSERT and automatically matches product_id to find the correct po_item_id

CREATE OR REPLACE FUNCTION auto_populate_gr_po_item_id()
RETURNS TRIGGER AS $$
BEGIN
  -- Only auto-populate if:
  -- 1. po_item_id is NULL (not explicitly set)
  -- 2. The GR is linked to a PO (has purchase_order_id)
  IF NEW.po_item_id IS NULL THEN
    -- Find the matching PO item by product_id
    SELECT poi.id INTO NEW.po_item_id
    FROM goods_receipts gr
    JOIN purchase_order_items poi ON poi.purchase_order_id = gr.purchase_order_id
    WHERE gr.id = NEW.goods_receipt_id
      AND poi.product_id = NEW.product_id
    LIMIT 1;
    
    -- Log if we found a match
    IF NEW.po_item_id IS NOT NULL THEN
      RAISE NOTICE 'Auto-populated po_item_id for GR item: product_id=%, po_item_id=%', 
        NEW.product_id, NEW.po_item_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_auto_populate_gr_po_item_id ON goods_receipt_items;

-- Create trigger that runs BEFORE INSERT
CREATE TRIGGER trg_auto_populate_gr_po_item_id
  BEFORE INSERT ON goods_receipt_items
  FOR EACH ROW
  EXECUTE FUNCTION auto_populate_gr_po_item_id();
