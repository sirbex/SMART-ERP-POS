-- Fix: fn_update_supplier_balance_internal and fn_recalculate_all_supplier_balances
-- Both reference goods_receipts.supplier_id which doesn't exist.
-- goods_receipts links to suppliers via: goods_receipts.purchase_order_id → purchase_orders.supplier_id

-- Fix fn_update_supplier_balance_internal
CREATE OR REPLACE FUNCTION fn_update_supplier_balance_internal(p_supplier_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Sum all completed GR values (join through purchase_orders for supplier_id)
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_total_payable
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    JOIN purchase_orders po ON po.id = gr.purchase_order_id
    WHERE po.supplier_id = p_supplier_id
      AND gr.status = 'COMPLETED';

    -- Sum all supplier payments
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_total_paid
    FROM supplier_payments
    WHERE "SupplierId" = p_supplier_id
      AND "Status" = 'COMPLETED';

    -- Balance = What we owe - What we paid
    v_new_balance := v_total_payable - v_total_paid;

    -- Update supplier balance
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;

    RAISE NOTICE 'Updated supplier % balance to %', p_supplier_id, v_new_balance;
END;
$$;

-- Fix fn_recalculate_all_supplier_balances
CREATE OR REPLACE FUNCTION fn_recalculate_all_supplier_balances()
RETURNS TABLE(supplier_id UUID, old_balance NUMERIC, new_balance NUMERIC, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
    v_supplier RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
BEGIN
    FOR v_supplier IN SELECT "Id" as id, "OutstandingBalance" as balance FROM suppliers LOOP
        v_old_balance := COALESCE(v_supplier.balance, 0);

        -- Calculate expected balance (join through purchase_orders for supplier_id)
        SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
        INTO v_total_payable
        FROM goods_receipts gr
        JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
        JOIN purchase_orders po ON po.id = gr.purchase_order_id
        WHERE po.supplier_id = v_supplier.id
          AND gr.status = 'COMPLETED';

        SELECT COALESCE(SUM("Amount"), 0)
        INTO v_total_paid
        FROM supplier_payments
        WHERE "SupplierId" = v_supplier.id
          AND "Status" = 'COMPLETED';

        v_new_balance := v_total_payable - v_total_paid;

        -- Update supplier balance
        UPDATE suppliers
        SET "OutstandingBalance" = v_new_balance,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_supplier.id;

        supplier_id := v_supplier.id;
        old_balance := v_old_balance;
        new_balance := v_new_balance;
        status := CASE
            WHEN v_old_balance = v_new_balance THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;

        RETURN NEXT;
    END LOOP;
END;
$$;
