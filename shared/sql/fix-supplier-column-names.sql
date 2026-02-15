-- Fix all supplier-related trigger functions to use correct column name "OutstandingBalance"
-- The suppliers table uses PascalCase: "Id", "OutstandingBalance", "UpdatedAt"
-- NOT "Balance" which doesn't exist

-- Fix fn_update_supplier_balance_internal
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
    
    -- Update supplier balance (correct column is "OutstandingBalance", NOT "Balance")
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
    RAISE NOTICE 'Updated supplier % balance to % (payable: %, paid: %)', 
        p_supplier_id, v_new_balance, v_total_payable, v_total_paid;
END;
$$;

-- Also fix fn_recalculate_supplier_ap_balance if it exists
CREATE OR REPLACE FUNCTION fn_recalculate_supplier_ap_balance(p_supplier_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_outstanding NUMERIC;
BEGIN
    -- Sum outstanding balances from all supplier invoices
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_total_outstanding
    FROM supplier_invoices
    WHERE "SupplierId" = p_supplier_id
      AND "Status" != 'Cancelled';
    
    -- Update supplier's AP balance (correct column is "OutstandingBalance")
    UPDATE suppliers
    SET "OutstandingBalance" = v_total_outstanding,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
    RAISE NOTICE 'Updated supplier % AP balance to %', p_supplier_id, v_total_outstanding;
END;
$$;

SELECT 'Supplier balance functions fixed to use "OutstandingBalance"' AS result;
