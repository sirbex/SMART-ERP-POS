-- Fix: fn_recalculate_supplier_balance references NEW.supplier_id on goods_receipts table
-- but goods_receipts has no supplier_id column. Must look up via purchase_order_id → purchase_orders.supplier_id
-- This caused "record 'new' has no field 'supplier_id'" when submitting POs (which creates goods receipts)

CREATE OR REPLACE FUNCTION fn_recalculate_supplier_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    -- Determine which supplier to update
    IF TG_TABLE_NAME = 'goods_receipts' THEN
        -- goods_receipts doesn't have supplier_id directly; look up via purchase_order
        IF TG_OP = 'DELETE' THEN
            SELECT po.supplier_id INTO v_supplier_id
            FROM purchase_orders po
            WHERE po.id = OLD.purchase_order_id;
        ELSE
            SELECT po.supplier_id INTO v_supplier_id
            FROM purchase_orders po
            WHERE po.id = NEW.purchase_order_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD."SupplierId";
        ELSE
            v_supplier_id := NEW."SupplierId";
        END IF;
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD.supplier_id;
        ELSE
            v_supplier_id := NEW.supplier_id;
        END IF;
    END IF;
    
    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_update_supplier_balance_internal(v_supplier_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;
