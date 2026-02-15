-- Fix fn_update_supplier_balance_internal to properly join through purchase_orders
-- The goods_receipts table does NOT have supplier_id - it must be looked up via purchase_order_id

CREATE OR REPLACE FUNCTION fn_update_supplier_balance_internal(p_supplier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Sum all completed GR values (join through purchase_orders to get supplier)
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_total_payable
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
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
    
    -- Update supplier balance (suppliers table uses PascalCase)
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
    RAISE NOTICE 'Updated supplier % balance to % (payable: %, paid: %)', 
        p_supplier_id, v_new_balance, v_total_payable, v_total_paid;
END;
$$;

-- Also update the comprehensive_data_triggers function that has the same issue
-- This function in comprehensive_data_triggers.sql also references gr.supplier_id
