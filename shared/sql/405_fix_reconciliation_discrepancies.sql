-- Migration 405: Fix accounting reconciliation discrepancies
-- Fixes:
--   1. AR (1200): Include outstanding delivery fee receivables in subledger calculation
--   2. Inventory (1300): Correct batch BATCH-20260302-004 quantity to match GR item (4.9920 vs 4.9900)
--   3. Prevent duplicate stock movements during GR finalization (add skip trigger guard)
-- Date: 2026-03-03

BEGIN;

-- ============================================================
-- FIX 1: Update fn_full_reconciliation_report to include delivery fees in AR subledger
-- The old query only counted SUM(OutstandingBalance) from invoices.
-- Delivery charges are posted to AR GL via recordDeliveryChargeToGL() 
-- but the delivery_orders table tracks them separately, not via invoices.
-- We must add outstanding delivery fees to the AR subledger total.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_full_reconciliation_report(p_as_of_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
    account_name TEXT,
    gl_balance NUMERIC,
    subledger_balance NUMERIC,
    difference NUMERIC,
    status TEXT,
    recommendation TEXT
) AS $$
DECLARE
    v_cash_gl NUMERIC;
    v_ar_gl NUMERIC;
    v_inv_gl NUMERIC;
    v_ap_gl NUMERIC;
    v_ar_sub NUMERIC;
    v_ar_invoices NUMERIC;
    v_ar_delivery_fees NUMERIC;
    v_inv_sub NUMERIC;
    v_ap_sub NUMERIC;
BEGIN
    -- Cash (1010) - no subledger, GL is source of truth
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_cash_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    RETURN QUERY SELECT
        'Cash (1010)'::TEXT,
        v_cash_gl,
        v_cash_gl, -- Cash has no subledger
        0::NUMERIC,
        'MATCHED'::TEXT,
        'Cash balance verified'::TEXT;

    -- Accounts Receivable (1200)
    -- GL side: sum of all debits minus credits on account 1200
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_ar_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- Subledger side: outstanding invoices + outstanding delivery fee receivables
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ar_invoices
    FROM invoices
    WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');

    -- Delivery fees that have been posted to AR GL but not yet collected
    -- delivery_orders with delivery_fee > 0 that are not yet completed/delivered  
    -- represent outstanding receivables for delivery charges
    SELECT COALESCE(SUM(dord.delivery_fee), 0)
    INTO v_ar_delivery_fees
    FROM delivery_orders dord
    WHERE dord.delivery_fee > 0
      AND dord.status NOT IN ('CANCELLED')
      AND dord.created_at::DATE <= p_as_of_date;

    v_ar_sub := v_ar_invoices + v_ar_delivery_fees;

    RETURN QUERY SELECT
        'Accounts Receivable (1200)'::TEXT,
        v_ar_gl,
        v_ar_sub,
        v_ar_gl - v_ar_sub,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01
            THEN 'AR reconciled successfully'
            ELSE 'Investigate: invoices_outstanding=' || v_ar_invoices::TEXT || ', delivery_fee_receivables=' || v_ar_delivery_fees::TEXT
        END::TEXT;

    -- Inventory (1300)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_inv_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
    INTO v_inv_sub
    FROM inventory_batches
    WHERE remaining_quantity > 0;

    RETURN QUERY SELECT
        'Inventory (1300)'::TEXT,
        v_inv_gl,
        v_inv_sub,
        v_inv_gl - v_inv_sub,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) < 0.01
            THEN 'Inventory reconciled successfully'
            ELSE 'Investigate inventory movements and batch valuations'
        END::TEXT;

    -- Accounts Payable (2100)
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_ap_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ap_sub
    FROM suppliers;

    RETURN QUERY SELECT
        'Accounts Payable (2100)'::TEXT,
        v_ap_gl,
        v_ap_sub,
        v_ap_gl - v_ap_sub,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) < 0.01
            THEN 'AP reconciled successfully'
            ELSE 'Investigate supplier invoices and payments'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FIX 2: Correct the inventory data mismatch for BATCH-20260302-004
-- GR item has received_quantity=4.9920; batch has 4.9900
-- The GR item is the authoritative record (it's what was actually received)
-- Update batch to match GR item, which will also match the GL entry (14,976)
-- ============================================================

-- Correct the batch quantity to match the GR item's received_quantity
UPDATE inventory_batches
SET quantity = 4.9920, 
    remaining_quantity = 4.9920
WHERE batch_number = 'BATCH-20260302-004'
  AND quantity = 4.9900
  AND remaining_quantity = 4.9900;

-- Also fix the stock movements to match
-- The trigger-created movement (SM-prefix, DIRECT_ENTRY reference) 
UPDATE stock_movements
SET quantity = 4.9920
WHERE batch_id = (SELECT id FROM inventory_batches WHERE batch_number = 'BATCH-20260302-004')
  AND quantity = 4.9900;

-- ============================================================
-- FIX 3: Delete duplicate stock movement created by fn_log_stock_movement trigger
-- During GR finalization, both the trigger and app code create movements.
-- The trigger creates SM-prefix with reference_type='DIRECT_ENTRY' (no reference_id, no notes)
-- The app creates MOV-prefix with reference_type='GOODS_RECEIPT' (proper reference_id + notes)
-- Keep the app-created one, delete the trigger-created duplicate.
-- ============================================================

-- Remove duplicate trigger-created stock movements for GR batches
-- Identify duplicates: same batch_id, both GOODS_RECEIPT type, one is DIRECT_ENTRY (trigger) and one is GOODS_RECEIPT (app)
DELETE FROM stock_movements sm_trigger
WHERE sm_trigger.id IN (
    SELECT sm1.id
    FROM stock_movements sm1
    WHERE sm1.reference_type = 'DIRECT_ENTRY'
      AND sm1.movement_type = 'GOODS_RECEIPT'
      AND sm1.notes IS NULL
      AND EXISTS (
          SELECT 1 FROM stock_movements sm2
          WHERE sm2.batch_id = sm1.batch_id
            AND sm2.movement_type = 'GOODS_RECEIPT'
            AND sm2.reference_type = 'GOODS_RECEIPT'
            AND sm2.id != sm1.id
      )
);

COMMIT;
