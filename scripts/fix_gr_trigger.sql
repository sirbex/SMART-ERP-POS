-- Fix the auto_populate_gr_po_item_id trigger to handle duplicate products
-- Old trigger used LIMIT 1 matching by product_id only, causing both GR items
-- for the same product to get the same po_item_id.
-- New trigger excludes PO items already claimed by another GR item in the same GR.
CREATE OR REPLACE FUNCTION public.auto_populate_gr_po_item_id()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.po_item_id IS NULL THEN
    SELECT poi.id INTO NEW.po_item_id
    FROM goods_receipts gr
    JOIN purchase_order_items poi ON poi.purchase_order_id = gr.purchase_order_id
    WHERE gr.id = NEW.goods_receipt_id
      AND poi.product_id = NEW.product_id
      AND NOT EXISTS (
        SELECT 1 FROM goods_receipt_items gri
        WHERE gri.po_item_id = poi.id
          AND gri.goods_receipt_id = NEW.goods_receipt_id
      )
    ORDER BY poi.created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$fn$;
