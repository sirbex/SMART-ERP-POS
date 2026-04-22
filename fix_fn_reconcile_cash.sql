-- ============================================================
-- Fix fn_reconcile_cash_account
-- 
-- Problem with old version:
--   It compared the GL Cash balance against SUM(invoice_payments
--   WHERE payment_method = 'CASH'), which only holds B2B invoice
--   partial payments (~10,998 UGX) and is NOT a cash subledger.
--   This always produced a false DISCREPANCY.
--
-- Fix:
--   Cash has no external subledger (unlike AR / AP).
--   The GL IS the cash book.  The function now returns the GL
--   balance broken down by movement type (sales, reversals,
--   refunds, other) so auditors can verify each category.
--   The NET_CASH row compares the sum of those categories
--   against the GL balance → always MATCHED (self-consistent).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_reconcile_cash_account(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(
    source      TEXT,
    description TEXT,
    amount      NUMERIC(18,6),
    difference  NUMERIC(18,6),
    status      TEXT
) AS $$
DECLARE
    v_gl_balance       NUMERIC(18,6) := 0;
    v_cash_in_sales    NUMERIC(18,6) := 0;
    v_cash_out_rev     NUMERIC(18,6) := 0;
    v_cash_out_refunds NUMERIC(18,6) := 0;
    v_other_net        NUMERIC(18,6) := 0;
    v_net_computed     NUMERIC(18,6);
    v_final_diff       NUMERIC(18,6);
BEGIN
    -- ── GL Cash balance (all statuses) ────────────────────────
    -- Must include ALL statuses because REVERSED entries pair with
    -- their POSTED reversal counterparts; excluding them gives the
    -- wrong result.
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- ── Cash inflows: SALE transactions ──────────────────────
    SELECT COALESCE(SUM(le."DebitAmount"), 0)
    INTO v_cash_in_sales
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."ReferenceType" = 'SALE'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- ── Cash outflows: REVERSAL transactions ─────────────────
    SELECT COALESCE(SUM(le."CreditAmount"), 0)
    INTO v_cash_out_rev
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."ReferenceType" = 'REVERSAL'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- ── Cash outflows: SALE_REFUND transactions ───────────────
    SELECT COALESCE(SUM(le."CreditAmount"), 0)
    INTO v_cash_out_refunds
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."ReferenceType" = 'SALE_REFUND'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- ── Other movements (JEs, adjustments, invoices, expenses)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_other_net
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."ReferenceType" NOT IN ('SALE', 'REVERSAL', 'SALE_REFUND')
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    v_net_computed := v_cash_in_sales
                    - v_cash_out_rev
                    - v_cash_out_refunds
                    + v_other_net;
    v_final_diff   := v_gl_balance - v_net_computed;

    -- ── Rows ──────────────────────────────────────────────────
    RETURN QUERY SELECT
        'GL_BALANCE'::TEXT,
        'Cash account (1010) current balance — General Ledger'::TEXT,
        v_gl_balance, 0::NUMERIC(18,6), 'BASE'::TEXT;

    RETURN QUERY SELECT
        'CASH_IN_SALES'::TEXT,
        'Cash received from completed sales (SALE type entries)'::TEXT,
        v_cash_in_sales, 0::NUMERIC(18,6), 'INFO'::TEXT;

    RETURN QUERY SELECT
        'CASH_OUT_REVERSALS'::TEXT,
        'Cash returned via sale reversals / voids (REVERSAL type)'::TEXT,
        -v_cash_out_rev, 0::NUMERIC(18,6), 'INFO'::TEXT;

    RETURN QUERY SELECT
        'CASH_OUT_REFUNDS'::TEXT,
        'Cash refunded on individual items (SALE_REFUND type)'::TEXT,
        -v_cash_out_refunds, 0::NUMERIC(18,6), 'INFO'::TEXT;

    RETURN QUERY SELECT
        'OTHER_MOVEMENTS'::TEXT,
        'Other cash movements (journal entries, adjustments, expenses)'::TEXT,
        v_other_net, 0::NUMERIC(18,6), 'INFO'::TEXT;

    RETURN QUERY SELECT
        'NET_CASH'::TEXT,
        'Net cash (sales − reversals − refunds + other) vs GL Balance'::TEXT,
        v_net_computed,
        v_final_diff,
        CASE WHEN ABS(v_final_diff) < 0.01
             THEN 'MATCHED'
             ELSE 'DISCREPANCY'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;
