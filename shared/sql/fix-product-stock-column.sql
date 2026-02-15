-- Fix fn_update_product_stock_internal to use correct column name
-- Column is 'quantity_on_hand' NOT 'stock_quantity'

CREATE OR REPLACE FUNCTION fn_update_product_stock_internal(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_quantity NUMERIC;
BEGIN
    -- Sum all batch quantities for this product
    SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO v_total_quantity
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND status = 'ACTIVE';
    
    -- Update product stock quantity (CORRECT column name: quantity_on_hand)
    UPDATE products
    SET quantity_on_hand = v_total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_product_id;
    
    RAISE NOTICE 'Updated product % stock to %', p_product_id, v_total_quantity;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to update product stock for %: %', p_product_id, SQLERRM;
END;
$$ LANGUAGE plpgsql;

SELECT 'fn_update_product_stock_internal FIXED: stock_quantity -> quantity_on_hand' as status;
