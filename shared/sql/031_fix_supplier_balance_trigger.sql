-- ============================================================================
-- Migration: 031_fix_supplier_balance_trigger.sql
-- Date: 2025-12-31
-- Purpose: Fix fn_recalculate_supplier_balance to use correct column names
--          supplier_payments uses PascalCase: "SupplierId", "Status"
--          goods_receipts uses snake_case: supplier_id
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_recalculate_supplier_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    -- Determine which supplier to update based on table
    IF TG_TABLE_NAME = 'goods_receipts' THEN
        -- goods_receipts gets supplier from purchase_order
        IF TG_OP = 'DELETE' THEN
            SELECT po.supplier_id INTO v_supplier_id 
            FROM purchase_orders po WHERE po.id = OLD.purchase_order_id;
        ELSE
            SELECT po.supplier_id INTO v_supplier_id 
            FROM purchase_orders po WHERE po.id = NEW.purchase_order_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
        -- supplier_payments uses PascalCase (EF Core convention)
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD."SupplierId";
        ELSE
            v_supplier_id := NEW."SupplierId";
        END IF;
    ELSIF TG_TABLE_NAME = 'supplier_invoices' THEN
        -- supplier_invoices uses PascalCase (EF Core convention)
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD."SupplierId";
        ELSE
            v_supplier_id := NEW."SupplierId";
        END IF;
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
        -- purchase_orders uses snake_case
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
$$ LANGUAGE plpgsql;

-- Also fix the internal function to use correct column names
CREATE OR REPLACE FUNCTION fn_update_supplier_balance_internal(p_supplier_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Sum all completed GR values 
    -- goods_receipts.supplier_id comes from purchase_orders.supplier_id via join
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_total_payable
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    JOIN purchase_orders po ON po.id = gr.purchase_order_id
    WHERE po.supplier_id = p_supplier_id
      AND gr.status = 'COMPLETED';
    
    -- Sum all supplier payments (supplier_payments uses PascalCase)
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_total_paid
    FROM supplier_payments
    WHERE "SupplierId" = p_supplier_id
      AND "Status" = 'COMPLETED';
    
    -- Balance = What we owe - What we paid
    v_new_balance := v_total_payable - v_total_paid;
    
    -- Update supplier balance (suppliers uses PascalCase)
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
    RAISE NOTICE 'Updated supplier % balance to %', p_supplier_id, v_new_balance;
END;
$$ LANGUAGE plpgsql;

SELECT 'Supplier balance trigger fixed with correct column names' as status;
