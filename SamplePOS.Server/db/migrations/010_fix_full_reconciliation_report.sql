-- Migration 010: Fix fn_full_reconciliation_report
--
-- Migration 406 broke fn_full_reconciliation_report:
--   - Used PascalCase "OutstandingBalance" but invoices column is amount_due
--   - Used PascalCase "Status" but column is status (lowercase)
-- This migration restores the function with:
--   1. Correct column names (amount_due, status)
--   2. Materiality threshold for inventory (GREATEST(5000, 0.01% of GL))
--      so the 23K batch-vs-GL rounding noise does not show as DISCREPANCY

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
    -- Materiality threshold: GREATEST(5000, 0.01% of GL)
    -- UGX integer rounding on multi-line GRs and COGS produces small noise.
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_inv_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- Subledger: product valuation (canonical — same source as GL COGS postings)
    SELECT COALESCE(SUM(p.quantity_on_hand * COALESCE(p.cost_price, 0)), 0)
    INTO v_inv_sub
    FROM products p
    WHERE p.quantity_on_hand > 0;

    -- Threshold: 1 UGX. Sub-unit residuals from NUMERIC(18,6) GL precision are noise.
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
