-- Migration 012: Fix fn_reconcile_cash_account
--
-- Root cause: the existing function compared the GL cash balance (account 1010,
-- ~19.9M UGX) against SUM(invoice_payments WHERE payment_method='CASH') (~30k).
-- invoice_payments only captures credit-sale AR repayments — a tiny fraction of
-- all cash flows. This produced a 19.9M DISCREPANCY / ACTION_REQUIRED that was
-- entirely spurious.
--
-- Cash (account 1010) has no traditional subledger — the GL is the single source
-- of truth. The correct reconciliation:
--   1. GL_BALANCE   — computed from ledger_entries (BASE)
--   2. STORED_BALANCE — accounts.CurrentBalance cache vs GL (MATCHED/DISCREPANCY)
--   3. CASH_SALES    — cash-payment POS sales (INFO, not a comparison)
--   4. CASH_AR_RECEIPTS — cash repayments of credit sales (INFO)
--   5. CASH_AP_PAYMENTS — cash payments to suppliers (INFO)
--
-- The INFO items are informational only and do not affect the reconciliation
-- status. Only STORED_BALANCE can trigger DISCREPANCY (if the cache has drifted
-- from the computed GL balance).

CREATE OR REPLACE FUNCTION fn_reconcile_cash_account(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(source TEXT, description TEXT, amount NUMERIC, difference NUMERIC, status TEXT)
LANGUAGE plpgsql AS $$
DECLARE
    v_gl_balance      NUMERIC(18,6) := 0;
    v_stored_balance  NUMERIC(18,6) := 0;
    v_cash_sales      NUMERIC(18,6) := 0;
    v_cash_ar         NUMERIC(18,6) := 0;
    v_cash_ap         NUMERIC(18,6) := 0;
    v_stored_diff     NUMERIC(18,6);
BEGIN
    -- ── 1. GL cash balance (account 1010) ─────────────────────────────────────
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- ── 2. Stored account balance ──────────────────────────────────────────────
    SELECT COALESCE("CurrentBalance", 0)
    INTO v_stored_balance
    FROM accounts
    WHERE "AccountCode" = '1010';

    -- ── 3. Cash-in from POS sales ──────────────────────────────────────────────
    SELECT COALESCE(
        SUM(CASE WHEN s.payment_method = 'CASH' THEN s.total_amount ELSE 0 END), 0
    )
    INTO v_cash_sales
    FROM sales s
    WHERE s.status = 'COMPLETED'
      AND s.sale_date::DATE <= p_as_of_date;

    -- ── 4. Cash-in from credit-sale repayments (AR receipts) ──────────────────
    SELECT COALESCE(SUM(ip.amount), 0)
    INTO v_cash_ar
    FROM invoice_payments ip
    WHERE ip.payment_method = 'CASH'
      AND ip.payment_date::DATE <= p_as_of_date;

    -- ── 5. Cash-out to suppliers ───────────────────────────────────────────────
    SELECT COALESCE(SUM(sp."Amount"), 0)
    INTO v_cash_ap
    FROM supplier_payments sp
    WHERE sp."PaymentMethod" = 'CASH'
      AND sp."PaymentDate"::DATE <= p_as_of_date;

    v_stored_diff := v_gl_balance - v_stored_balance;

    -- ── Return rows ────────────────────────────────────────────────────────────

    -- Row 1: GL balance — source of truth for cash (BASE)
    RETURN QUERY SELECT
        'GL_BALANCE'::TEXT,
        'Cash account (1010) balance computed from General Ledger entries'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT;

    -- Row 2: Stored account balance vs GL (materiality: 1 UGX)
    RETURN QUERY SELECT
        'STORED_BALANCE'::TEXT,
        'Account CurrentBalance cache on accounts table (should equal GL)'::TEXT,
        v_stored_balance,
        v_stored_diff,
        CASE WHEN ABS(v_stored_diff) <= 1 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT;

    -- Row 3–5: Informational cash flow breakdown (INFO — no impact on status)
    RETURN QUERY SELECT
        'CASH_SALES'::TEXT,
        'Cash collected from POS sales (payment_method = CASH)'::TEXT,
        v_cash_sales,
        0::NUMERIC(18,6),
        'INFO'::TEXT;

    RETURN QUERY SELECT
        'CASH_AR_RECEIPTS'::TEXT,
        'Cash received as repayment of credit sales (invoice_payments)'::TEXT,
        v_cash_ar,
        0::NUMERIC(18,6),
        'INFO'::TEXT;

    RETURN QUERY SELECT
        'CASH_AP_PAYMENTS'::TEXT,
        'Cash paid to suppliers (supplier_payments, PaymentMethod = CASH)'::TEXT,
        v_cash_ap,
        0::NUMERIC(18,6),
        'INFO'::TEXT;

END;
$$;
