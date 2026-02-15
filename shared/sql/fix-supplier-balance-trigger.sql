-- Fix fn_recalculate_supplier_balance trigger function
-- The goods_receipts table doesn't have supplier_id column
-- Supplier is fetched via purchase_order_id -> purchase_orders.supplier_id

CREATE OR REPLACE FUNCTION fn_recalculate_supplier_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
    v_po_id UUID;
BEGIN
    -- Determine which supplier to update based on which table triggered
    IF TG_TABLE_NAME = 'goods_receipts' THEN
        -- For goods_receipts, get supplier_id through purchase_order
        IF TG_OP = 'DELETE' THEN
            v_po_id := OLD.purchase_order_id;
        ELSE
            v_po_id := NEW.purchase_order_id;
        END IF;
        
        -- Look up supplier from purchase order
        SELECT supplier_id INTO v_supplier_id
        FROM purchase_orders
        WHERE id = v_po_id;
        
    ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
        -- supplier_payments uses PascalCase column names
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD."SupplierId";
        ELSE
            v_supplier_id := NEW."SupplierId";
        END IF;
        
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
        -- purchase_orders has supplier_id directly
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD.supplier_id;
        ELSE
            v_supplier_id := NEW.supplier_id;
        END IF;
    END IF;
    
    -- Update supplier balance if we found a supplier
    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_update_supplier_balance_internal(v_supplier_id);
    END IF;
    
    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
