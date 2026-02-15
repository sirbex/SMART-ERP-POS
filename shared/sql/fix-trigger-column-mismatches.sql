-- =============================================================================
-- FIX: Trigger Column Mismatches (supplier_id, total_value)
-- Date: 2025-12-27
-- 
-- These fixes resolve issues where trigger functions referenced columns that
-- don't exist on certain tables:
-- 1. fn_recalculate_supplier_balance - referenced goods_receipts.supplier_id
-- 2. fn_update_supplier_balance_internal - referenced goods_receipts.supplier_id
-- 3. fn_update_gr_totals_internal - referenced goods_receipts.total_value
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Add missing total_value column to goods_receipts
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'goods_receipts' AND column_name = 'total_value'
    ) THEN
        ALTER TABLE goods_receipts ADD COLUMN total_value NUMERIC(18,6) DEFAULT 0;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. Fix fn_recalculate_supplier_balance trigger function
-- goods_receipts does NOT have supplier_id - must join through purchase_orders
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_recalculate_supplier_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
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
$$;

-- -----------------------------------------------------------------------------
-- 3. Fix fn_update_supplier_balance_internal function
-- Must join goods_receipts through purchase_orders to get supplier_id
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Summary of Column Naming Conventions
-- -----------------------------------------------------------------------------
-- Table                  | Column Style    | Example
-- -----------------------|-----------------|------------------
-- purchase_orders        | snake_case      | supplier_id, order_date
-- goods_receipts         | snake_case      | purchase_order_id, total_value
-- goods_receipt_items    | snake_case      | goods_receipt_id, cost_price
-- suppliers              | PascalCase      | "Id", "CompanyName", "OutstandingBalance"
-- supplier_payments      | PascalCase      | "SupplierId", "Amount", "Status"
-- supplier_invoices      | PascalCase      | "Id", "SupplierId", "TotalAmount"
-- accounts               | PascalCase      | "Id", "AccountCode", "CurrentBalance"
-- ledger_transactions    | PascalCase      | "Id", "TransactionNumber"
-- ledger_entries         | PascalCase      | "Id", "AccountId", "Amount"
-- products               | snake_case      | id, name, cost_price
-- users                  | snake_case      | id, email, full_name
-- -----------------------------------------------------------------------------

SELECT 'Trigger column mismatch fixes applied successfully' AS result;
