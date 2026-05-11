-- Migration 011: Fix fn_full_reconciliation_report subledger sources
--
-- Two issues with the existing function (migration 010):
--
-- 1. Inventory subledger used products.quantity_on_hand * cost_price
--    but the canonical subledger is inventory_batches.remaining_quantity * cost_price
--    (GL COGS is posted using FEFO batch.cost_price, not products.cost_price).
--    products.cost_price drifts over time as new GRs update it but don't
--    retroactively reprice existing batches.
--    With the correct subledger both sides equal 102,060,216.98 → MATCHED.
--
-- 2. AP GL query used total AP balance (all EntityType values).
--    Account 2100 legitimately holds both supplier payables AND expense accruals
--    (airtime, allowances, fuel — 400k outstanding as at 2026-05-11).
--    Comparing total AP GL to suppliers.OutstandingBalance created a false 356k gap.
--    Fix: scope AP GL to EntityType='SUPPLIER' entries only, matching the
--    methodology already used by reconcileAccountsPayable().

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
    v_cash_gl    NUMERIC;
    v_ar_gl      NUMERIC;
    v_inv_gl     NUMERIC;
    v_ap_gl      NUMERIC;
    v_ar_sub     NUMERIC;
    v_inv_sub    NUMERIC;
    v_ap_sub     NUMERIC;
    v_inv_threshold NUMERIC;
    v_ap_threshold  NUMERIC;
BEGIN
    -- ── Cash (1010) ──────────────────────────────────────────────
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
        v_cash_gl,   -- Cash has no subledger; GL is source of truth
        0::NUMERIC,
        'MATCHED'::TEXT,
        'Cash balance verified'::TEXT;

    -- ── Accounts Receivable (1200) ────────────────────────────────
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_ar_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- amount_due is the correct column (NOT "OutstandingBalance")
    SELECT COALESCE(SUM(inv.amount_due), 0)
    INTO v_ar_sub
    FROM invoices inv
    WHERE inv.status IN ('UNPAID', 'PARTIALLY_PAID', 'ISSUED', 'PENDING');

    RETURN QUERY SELECT
        'Accounts Receivable (1200)'::TEXT,
        v_ar_gl,
        v_ar_sub,
        v_ar_gl - v_ar_sub,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01
            THEN 'AR reconciled successfully'
            ELSE 'Investigate outstanding invoices (' || v_ar_sub::BIGINT::TEXT || ' UGX)'
        END::TEXT;

    -- ── Inventory (1300) ─────────────────────────────────────────
    -- GL: include all ledger statuses (POSTED + REVERSED) — REVERSED entries
    -- represent valid reversals that cancel out their originals, consistent with
    -- what inventory_batches.remaining_quantity reflects.
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_inv_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- Subledger: inventory_batches.remaining_quantity * cost_price (FEFO canonical source).
    -- GL COGS is posted using FEFO batch.cost_price, not products.cost_price.
    -- products.cost_price drifts on new GRs and does NOT match GL COGS basis.
    SELECT COALESCE(SUM(ib.remaining_quantity * COALESCE(ib.cost_price, 0)), 0)
    INTO v_inv_sub
    FROM inventory_batches ib
    WHERE ib.remaining_quantity > 0;

    -- Materiality threshold: 1 UGX (sub-unit residuals from NUMERIC(18,6) are noise).
    v_inv_threshold := 1;

    RETURN QUERY SELECT
        'Inventory (1300)'::TEXT,
        v_inv_gl,
        v_inv_sub,
        v_inv_gl - v_inv_sub,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) <= v_inv_threshold
             THEN 'MATCHED'
             ELSE 'DISCREPANCY'
        END::TEXT,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) <= v_inv_threshold
            THEN 'Inventory reconciled (within ' || v_inv_threshold::BIGINT::TEXT || ' UGX materiality threshold)'
            ELSE 'Investigate inventory movements and batch valuations (threshold=' || v_inv_threshold::BIGINT::TEXT || ' UGX)'
        END::TEXT;

    -- ── Accounts Payable (2100) ───────────────────────────────────
    -- GL: scope to EntityType='SUPPLIER' only.
    -- Account 2100 also holds expense accruals (airtime, allowances, fuel, etc.)
    -- which are legitimate payables but not supplier balances. Including them in
    -- the GL-vs-supplier-table comparison produces a false discrepancy.
    -- This matches the methodology used by reconcileAccountsPayable().
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_ap_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND UPPER(le."EntityType") = 'SUPPLIER'
      AND lt."TransactionDate"::DATE <= p_as_of_date
      AND lt."Status" = 'POSTED';

    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ap_sub
    FROM suppliers;

    v_ap_threshold := GREATEST(1000, ABS(v_ap_gl) * 0.0001);

    RETURN QUERY SELECT
        'Accounts Payable (2100)'::TEXT,
        v_ap_gl,
        v_ap_sub,
        v_ap_gl - v_ap_sub,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold
             THEN 'MATCHED'
             ELSE 'DISCREPANCY'
        END::TEXT,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold
            THEN 'AP reconciled successfully'
            ELSE 'Investigate supplier outstanding balances'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;
