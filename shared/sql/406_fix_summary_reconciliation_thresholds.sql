-- Migration 406: Align reconciliation summary thresholds with per-account functions
-- Fixes:
--   1. Inventory (1300): Use GREATEST(5000, 0.01% of GL) materiality threshold
--      instead of < 0.01 (zero tolerance). UGX integer currency causes
--      small GL-vs-subledger noise from multi-line rounding on GRs & COGS.
--   2. AP (2100): Apply same materiality threshold. Known 695 UGX drift from
--      return-to-supplier bug (fixed in b2f07e5) is within tolerance.
--   3. Data fix: Reduce SALUD PHARMACY outstanding balance by 695 to match GL
--      (return RGRN-2026-0003 was GL-posted but supplier balance wasn't reduced).
-- Date: 2026-04-09

BEGIN;

-- ============================================================
-- FIX 1: Recreate fn_full_reconciliation_report with materiality thresholds
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
    v_inv_threshold NUMERIC;
    v_ap_threshold NUMERIC;
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
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_ar_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ar_invoices
    FROM invoices
    WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');

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
    -- Materiality threshold: GREATEST(5000, 0.01% of GL balance)
    -- UGX is an integer currency — per-line rounding on multi-line GRs and
    -- COGS calculations inevitably produces small GL-vs-subledger noise.
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

    v_inv_threshold := GREATEST(5000, ABS(v_inv_gl) * 0.0001);

    RETURN QUERY SELECT
        'Inventory (1300)'::TEXT,
        v_inv_gl,
        v_inv_sub,
        v_inv_gl - v_inv_sub,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) <= v_inv_threshold THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) <= v_inv_threshold
            THEN 'Inventory reconciled (within ' || v_inv_threshold::INTEGER::TEXT || ' UGX materiality threshold)'
            ELSE 'Investigate inventory movements and batch valuations (threshold=' || v_inv_threshold::INTEGER::TEXT || ' UGX)'
        END::TEXT;

    -- Accounts Payable (2100)
    -- Materiality threshold: GREATEST(1000, 0.01% of GL balance)
    -- Same rounding rationale as inventory for UGX integer currency.
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

    v_ap_threshold := GREATEST(1000, ABS(v_ap_gl) * 0.0001);

    RETURN QUERY SELECT
        'Accounts Payable (2100)'::TEXT,
        v_ap_gl,
        v_ap_sub,
        v_ap_gl - v_ap_sub,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold
            THEN 'AP reconciled (within ' || v_ap_threshold::INTEGER::TEXT || ' UGX materiality threshold)'
            ELSE 'Investigate supplier invoices and payments (threshold=' || v_ap_threshold::INTEGER::TEXT || ' UGX)'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FIX 2: Correct SALUD PHARMACY outstanding balance for return RGRN-2026-0003
-- The return-to-supplier code (fixed in b2f07e5) posted GL debit to 2100 (695)
-- but failed to reduce the supplier outstanding balance.
-- ============================================================

UPDATE suppliers
SET "OutstandingBalance" = "OutstandingBalance" - 695
WHERE "Id" = '4aaa54bf-c802-45d3-8a64-02e73e2172ac'
  AND "CompanyName" = 'SALUD PHARMACY LIMITED';

-- Verify
DO $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    SELECT "OutstandingBalance" INTO v_new_balance
    FROM suppliers WHERE "Id" = '4aaa54bf-c802-45d3-8a64-02e73e2172ac';
    RAISE NOTICE 'SALUD PHARMACY new outstanding balance: %', v_new_balance;
END $$;

COMMIT;
