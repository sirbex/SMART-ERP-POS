-- ============================================================================
-- Migration 252: Fix AP discrepancy - Exclude bonus items from supplier balance
-- ============================================================================
-- Root Cause: The supplier balance triggers include bonus items (is_bonus=true)
-- in their GR total calculation, but GL posting correctly excludes them.
-- Bonus items are free goods - no payment is owed, so they should NOT increase
-- the supplier's OutstandingBalance.
--
-- Affected triggers:
--   1. sync_supplier_on_gr_complete()     - on goods_receipts UPDATE
--   2. sync_supplier_balance_on_gr()       - on goods_receipt_items INSERT/UPDATE/DELETE
--   3. sync_supplier_balance_on_payment()  - on supplier_payments INSERT/UPDATE/DELETE
--
-- Fix: Add "AND (gri.is_bonus = false OR gri.is_bonus IS NULL)" to all three
-- ============================================================================

-- 1. Fix sync_supplier_on_gr_complete
CREATE OR REPLACE FUNCTION sync_supplier_on_gr_complete()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
    v_gr_total NUMERIC(18,6);
    v_payment_total NUMERIC(18,6);
    v_new_balance NUMERIC(18,6);
BEGIN
    -- Only act when status changes TO 'COMPLETED'
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        -- Get supplier from PO
        SELECT po.supplier_id INTO v_supplier_id
        FROM purchase_orders po
        WHERE po.id = NEW.purchase_order_id;
        
        IF v_supplier_id IS NOT NULL THEN
            -- Calculate total goods received for this supplier (EXCLUDE BONUS ITEMS)
            SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
            INTO v_gr_total
            FROM goods_receipts gr
            JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
            JOIN purchase_orders po ON gr.purchase_order_id = po.id
            WHERE po.supplier_id = v_supplier_id
              AND gr.status = 'COMPLETED'
              AND (gri.is_bonus = false OR gri.is_bonus IS NULL);
            
            -- Calculate total payments for this supplier
            SELECT COALESCE(SUM("Amount"), 0)
            INTO v_payment_total
            FROM supplier_payments
            WHERE "SupplierId" = v_supplier_id
              AND "Status" = 'COMPLETED';
            
            -- Calculate and update
            v_new_balance := v_gr_total - v_payment_total;
            
            UPDATE suppliers
            SET "OutstandingBalance" = v_new_balance,
                "UpdatedAt" = NOW()
            WHERE "Id" = v_supplier_id;
            
            RAISE NOTICE 'GR Complete: Supplier % balance = %', v_supplier_id, v_new_balance;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- 2. Fix sync_supplier_balance_on_gr
CREATE OR REPLACE FUNCTION sync_supplier_balance_on_gr()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
    v_gr_total NUMERIC(18,6);
    v_payment_total NUMERIC(18,6);
    v_new_balance NUMERIC(18,6);
BEGIN
    -- Get supplier from the goods receipt -> PO chain
    SELECT po.supplier_id INTO v_supplier_id
    FROM goods_receipts gr
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE gr.id = COALESCE(NEW.goods_receipt_id, OLD.goods_receipt_id);
    
    IF v_supplier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate total goods received for this supplier (EXCLUDE BONUS ITEMS)
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_gr_total
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = v_supplier_id
      AND gr.status = 'COMPLETED'
      AND (gri.is_bonus = false OR gri.is_bonus IS NULL);
    
    -- Calculate total payments for this supplier
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_payment_total
    FROM supplier_payments
    WHERE "SupplierId" = v_supplier_id
      AND "Status" = 'COMPLETED';
    
    -- Calculate new balance
    v_new_balance := v_gr_total - v_payment_total;
    
    -- Update supplier balance
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = NOW()
    WHERE "Id" = v_supplier_id;
    
    RAISE NOTICE 'Supplier % balance updated to % (GR: %, Paid: %)', 
        v_supplier_id, v_new_balance, v_gr_total, v_payment_total;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- 3. Fix sync_supplier_balance_on_payment (also calculates GR total)
CREATE OR REPLACE FUNCTION sync_supplier_balance_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
    v_gr_total NUMERIC(18,6);
    v_payment_total NUMERIC(18,6);
    v_new_balance NUMERIC(18,6);
BEGIN
    -- Get supplier ID from the payment
    v_supplier_id := COALESCE(NEW."SupplierId", OLD."SupplierId");
    
    IF v_supplier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate total goods received for this supplier (EXCLUDE BONUS ITEMS)
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_gr_total
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = v_supplier_id
      AND gr.status = 'COMPLETED'
      AND (gri.is_bonus = false OR gri.is_bonus IS NULL);
    
    -- Calculate total payments for this supplier
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_payment_total
    FROM supplier_payments
    WHERE "SupplierId" = v_supplier_id
      AND "Status" = 'COMPLETED';
    
    -- Calculate new balance
    v_new_balance := v_gr_total - v_payment_total;
    
    -- Update supplier balance
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = NOW()
    WHERE "Id" = v_supplier_id;
    
    RAISE NOTICE 'Supplier % balance updated to % (GR: %, Paid: %)', 
        v_supplier_id, v_new_balance, v_gr_total, v_payment_total;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- STEP 2: Recalculate all supplier balances (repair existing data)
-- ============================================================================

-- Recalculate outstanding balance for ALL suppliers excluding bonus items
UPDATE suppliers s
SET "OutstandingBalance" = COALESCE(calc.balance, 0),
    "UpdatedAt" = NOW()
FROM (
    SELECT 
        po_sup.supplier_id,
        COALESCE(po_sup.gr_total, 0) - COALESCE(pay.paid, 0) AS balance
    FROM (
        SELECT po.supplier_id,
               SUM(gri.received_quantity * gri.cost_price) AS gr_total
        FROM goods_receipts gr
        JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
        JOIN purchase_orders po ON gr.purchase_order_id = po.id
        WHERE gr.status = 'COMPLETED'
          AND (gri.is_bonus = false OR gri.is_bonus IS NULL)
        GROUP BY po.supplier_id
    ) po_sup
    LEFT JOIN (
        SELECT "SupplierId",
               SUM("Amount") AS paid
        FROM supplier_payments
        WHERE "Status" = 'COMPLETED'
        GROUP BY "SupplierId"
    ) pay ON pay."SupplierId" = po_sup.supplier_id
) calc
WHERE s."Id" = calc.supplier_id;

-- Also zero out suppliers that have NO completed GRs
UPDATE suppliers s
SET "OutstandingBalance" = 0 - COALESCE(pay.paid, 0),
    "UpdatedAt" = NOW()
FROM (
    SELECT "SupplierId", SUM("Amount") AS paid
    FROM supplier_payments
    WHERE "Status" = 'COMPLETED'
    GROUP BY "SupplierId"
) pay
WHERE s."Id" = pay."SupplierId"
  AND NOT EXISTS (
    SELECT 1 FROM goods_receipts gr
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = s."Id"
      AND gr.status = 'COMPLETED'
  );


-- ============================================================================
-- STEP 3: Verify fix
-- ============================================================================
SELECT 'BEFORE/AFTER COMPARISON' AS check_type;

SELECT * FROM fn_reconcile_accounts_payable();
