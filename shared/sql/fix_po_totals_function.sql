-- Fix fn_update_po_totals_internal to use correct column name
-- The function was using 'quantity' but the column is 'ordered_quantity'

CREATE OR REPLACE FUNCTION public.fn_update_po_totals_internal(p_po_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_amount NUMERIC;
    v_item_count INTEGER;
BEGIN
    SELECT 
        COALESCE(SUM(ordered_quantity * unit_price), 0),
        COUNT(*)
    INTO v_total_amount, v_item_count
    FROM purchase_order_items
    WHERE purchase_order_id = p_po_id;
    
    UPDATE purchase_orders
    SET total_amount = v_total_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_po_id;
END;
$$;
