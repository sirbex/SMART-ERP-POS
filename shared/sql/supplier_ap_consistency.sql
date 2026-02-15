-- ============================================================================
-- SUPPLIER ACCOUNTS PAYABLE CONSISTENCY & SINGLE SOURCE OF TRUTH
-- ============================================================================
-- Created: 2025-12-27
-- Purpose: Ensure suppliers.OutstandingBalance always matches GL Account 2100
-- 
-- ARCHITECTURE:
-- 1. GL Account 2100 (Accounts Payable) is the SINGLE SOURCE OF TRUTH
-- 2. Supplier.OutstandingBalance is a DERIVED cache for quick lookup
-- 3. Triggers maintain consistency automatically
-- 
-- FORMULA: OutstandingBalance = SUM(Goods Receipt Values) - SUM(Payments Made)
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC - Find discrepancies
-- ============================================================================

-- Show current discrepancy
SELECT 
    'GL Account 2100' as source,
    (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '2100') as balance
UNION ALL
SELECT 
    'Suppliers Sum' as source,
    (SELECT SUM("OutstandingBalance") FROM suppliers WHERE "IsActive" = true) as balance;

-- Detailed supplier analysis
SELECT 
    s."CompanyName",
    s."OutstandingBalance" as current_balance,
    COALESCE(gr_totals.gr_value, 0) as goods_received,
    COALESCE(payment_totals.paid, 0) as payments_made,
    COALESCE(gr_totals.gr_value, 0) - COALESCE(payment_totals.paid, 0) as calculated_balance,
    s."OutstandingBalance" - (COALESCE(gr_totals.gr_value, 0) - COALESCE(payment_totals.paid, 0)) as discrepancy
FROM suppliers s
LEFT JOIN (
    SELECT 
        po.supplier_id,
        SUM(gri.received_quantity * gri.cost_price) as gr_value
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE gr.status = 'COMPLETED'
    GROUP BY po.supplier_id
) gr_totals ON gr_totals.supplier_id = s."Id"
LEFT JOIN (
    SELECT 
        "SupplierId",
        SUM("Amount") as paid
    FROM supplier_payments
    WHERE "Status" = 'COMPLETED'
    GROUP BY "SupplierId"
) payment_totals ON payment_totals."SupplierId" = s."Id"
WHERE s."IsActive" = true;

-- ============================================================================
-- STEP 2: RECONCILIATION - Fix supplier balances from source data
-- ============================================================================

-- Update each supplier's OutstandingBalance from actual transactions
UPDATE suppliers s
SET "OutstandingBalance" = COALESCE(gr_totals.gr_value, 0) - COALESCE(payment_totals.paid, 0),
    "UpdatedAt" = NOW()
FROM (
    SELECT 
        po.supplier_id,
        SUM(gri.received_quantity * gri.cost_price) as gr_value
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE gr.status = 'COMPLETED'
    GROUP BY po.supplier_id
) gr_totals
LEFT JOIN (
    SELECT 
        "SupplierId",
        SUM("Amount") as paid
    FROM supplier_payments
    WHERE "Status" = 'COMPLETED'
    GROUP BY "SupplierId"
) payment_totals ON payment_totals."SupplierId" = gr_totals.supplier_id
WHERE s."Id" = gr_totals.supplier_id;

-- Also update suppliers with payments but no GR (shouldn't happen, but handle it)
UPDATE suppliers s
SET "OutstandingBalance" = -COALESCE((
    SELECT SUM("Amount") FROM supplier_payments 
    WHERE "SupplierId" = s."Id" AND "Status" = 'COMPLETED'
), 0),
    "UpdatedAt" = NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM goods_receipts gr
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = s."Id" AND gr.status = 'COMPLETED'
)
AND EXISTS (
    SELECT 1 FROM supplier_payments WHERE "SupplierId" = s."Id" AND "Status" = 'COMPLETED'
);

-- ============================================================================
-- STEP 3: SYNC GL ACCOUNT 2100 FROM LEDGER ENTRIES
-- ============================================================================

-- Recalculate Account 2100 balance from ledger entries
UPDATE accounts
SET "CurrentBalance" = (
    SELECT COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0)
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
    WHERE le."AccountId" = accounts."Id"
      AND lt."Status" = 'POSTED'
),
"UpdatedAt" = NOW()
WHERE "AccountCode" = '2100';

-- ============================================================================
-- STEP 4: VERIFICATION
-- ============================================================================

-- Verify consistency after fix
SELECT 
    'After Fix - GL Account 2100' as source,
    (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '2100') as balance
UNION ALL
SELECT 
    'After Fix - Suppliers Sum' as source,
    (SELECT SUM("OutstandingBalance") FROM suppliers WHERE "IsActive" = true) as balance;

-- ============================================================================
-- STEP 5: CREATE CONSISTENCY TRIGGERS
-- ============================================================================

-- Drop existing triggers if any
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_on_gr ON goods_receipt_items;
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_on_payment ON supplier_payments;
DROP FUNCTION IF EXISTS sync_supplier_balance_on_gr();
DROP FUNCTION IF EXISTS sync_supplier_balance_on_payment();

-- Function to recalculate supplier balance when goods receipt is finalized
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
    
    -- Calculate total goods received for this supplier
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_gr_total
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = v_supplier_id
      AND gr.status = 'COMPLETED';
    
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

-- Function to recalculate supplier balance when payment is made
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
    
    -- Calculate total goods received for this supplier
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_gr_total
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = v_supplier_id
      AND gr.status = 'COMPLETED';
    
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

-- Trigger on goods_receipt_items (fires when GR items are added/updated)
CREATE TRIGGER trg_sync_supplier_balance_on_gr
AFTER INSERT OR UPDATE OR DELETE ON goods_receipt_items
FOR EACH ROW
EXECUTE FUNCTION sync_supplier_balance_on_gr();

-- Trigger on supplier_payments (fires when payments are made)
CREATE TRIGGER trg_sync_supplier_balance_on_payment
AFTER INSERT OR UPDATE OR DELETE ON supplier_payments
FOR EACH ROW
EXECUTE FUNCTION sync_supplier_balance_on_payment();

-- ============================================================================
-- STEP 6: GOODS RECEIPT STATUS CHANGE TRIGGER
-- ============================================================================

-- Also trigger when GR status changes to COMPLETED
DROP TRIGGER IF EXISTS trg_sync_supplier_on_gr_complete ON goods_receipts;
DROP FUNCTION IF EXISTS sync_supplier_on_gr_complete();

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
            -- Calculate total goods received for this supplier
            SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
            INTO v_gr_total
            FROM goods_receipts gr
            JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
            JOIN purchase_orders po ON gr.purchase_order_id = po.id
            WHERE po.supplier_id = v_supplier_id
              AND gr.status = 'COMPLETED';
            
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

CREATE TRIGGER trg_sync_supplier_on_gr_complete
AFTER UPDATE ON goods_receipts
FOR EACH ROW
EXECUTE FUNCTION sync_supplier_on_gr_complete();

-- ============================================================================
-- STEP 7: GL ACCOUNT BALANCE SYNC TRIGGER (on ledger_entries)
-- ============================================================================

-- This ensures accounts.CurrentBalance always matches sum of ledger entries
DROP TRIGGER IF EXISTS trg_sync_account_balance_on_ledger ON ledger_entries;
DROP FUNCTION IF EXISTS sync_account_balance_on_ledger();

CREATE OR REPLACE FUNCTION sync_account_balance_on_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_account_id UUID;
    v_new_balance NUMERIC(18,6);
    v_normal_balance VARCHAR(10);
BEGIN
    -- Get the affected account ID
    v_account_id := COALESCE(NEW."AccountId", OLD."AccountId");
    
    IF v_account_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Get normal balance type
    SELECT "NormalBalance" INTO v_normal_balance
    FROM accounts WHERE "Id" = v_account_id;
    
    -- Calculate new balance from all posted entries
    SELECT 
        CASE 
            WHEN v_normal_balance = 'DEBIT' THEN
                COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0)
            ELSE
                COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0)
        END
    INTO v_new_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
    WHERE le."AccountId" = v_account_id
      AND lt."Status" = 'POSTED';
    
    -- Update account balance
    UPDATE accounts
    SET "CurrentBalance" = COALESCE(v_new_balance, 0),
        "UpdatedAt" = NOW()
    WHERE "Id" = v_account_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_account_balance_on_ledger
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
FOR EACH ROW
EXECUTE FUNCTION sync_account_balance_on_ledger();

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================

SELECT 'FINAL VERIFICATION' as step;

SELECT 
    'GL Account 2100 (AP)' as source,
    (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '2100')::TEXT as balance
UNION ALL
SELECT 
    'Suppliers Outstanding Sum' as source,
    (SELECT SUM("OutstandingBalance") FROM suppliers WHERE "IsActive" = true)::TEXT as balance
UNION ALL
SELECT 
    'Status' as source,
    CASE 
        WHEN ABS(
            (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '2100') -
            (SELECT SUM("OutstandingBalance") FROM suppliers WHERE "IsActive" = true)
        ) < 0.01 THEN '✅ BALANCED - Single Source of Truth Established'
        ELSE '❌ DISCREPANCY DETECTED'
    END as balance;

-- Show individual supplier balances
SELECT 
    s."CompanyName",
    s."OutstandingBalance" as balance,
    CASE 
        WHEN s."OutstandingBalance" > 0 THEN 'Owes supplier'
        WHEN s."OutstandingBalance" < 0 THEN 'Overpaid (credit)'
        ELSE 'Settled'
    END as status
FROM suppliers s
WHERE s."IsActive" = true
ORDER BY s."OutstandingBalance" DESC;
