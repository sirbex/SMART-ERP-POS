-- Add validation function to prevent finalizing GR with missing po_item_id links
-- This ensures data integrity and prevents PO status update failures

CREATE OR REPLACE FUNCTION validate_gr_finalization()
RETURNS TRIGGER AS $$
DECLARE
  missing_links INTEGER;
  po_id UUID;
BEGIN
  -- Only check when status changes to COMPLETED
  IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
    
    -- Get the PO id for this GR
    po_id := NEW.purchase_order_id;
    
    -- If GR is linked to a PO, ensure all items have po_item_id
    IF po_id IS NOT NULL THEN
      SELECT COUNT(*) INTO missing_links
      FROM goods_receipt_items gri
      WHERE gri.goods_receipt_id = NEW.id
        AND gri.po_item_id IS NULL
        AND gri.received_quantity > 0;
      
      IF missing_links > 0 THEN
        RAISE EXCEPTION 
          'Cannot finalize GR %: % items missing po_item_id link. This will break PO status tracking.',
          NEW.receipt_number, missing_links
          USING HINT = 'Run the auto-fix script: UPDATE goods_receipt_items SET po_item_id = (SELECT poi.id FROM purchase_order_items poi WHERE poi.purchase_order_id = ''' || po_id || ''' AND poi.product_id = goods_receipt_items.product_id LIMIT 1) WHERE goods_receipt_id = ''' || NEW.id || ''' AND po_item_id IS NULL';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_validate_gr_finalization ON goods_receipts;

-- Create trigger that runs BEFORE UPDATE
CREATE TRIGGER trg_validate_gr_finalization
  BEFORE UPDATE ON goods_receipts
  FOR EACH ROW
  WHEN (NEW.status = 'COMPLETED')
  EXECUTE FUNCTION validate_gr_finalization();

-- Success message
DO $$
BEGIN
  RAISE NOTICE '✅ Validation trigger installed: prevents finalizing GR without proper po_item_id links';
  RAISE NOTICE '✅ This ensures PO status will always update correctly';
END $$;
