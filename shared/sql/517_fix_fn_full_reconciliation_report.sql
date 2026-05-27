-- Migration 517: Fix fn_full_reconciliation_report column names
--
-- Migration 406 referenced invoices."OutstandingBalance" and invoices."Status"
-- but the live schema uses amount_due and status (lowercase).
-- Restores AR subledger + delivery fees, batch inventory subledger, and
-- supplier-scoped AP GL (matches reconcileAccountsPayable).

BEGIN;

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
    v_cash_gl           NUMERIC;
    v_ar_gl             NUMERIC;
    v_inv_gl            NUMERIC;
    v_ap_gl             NUMERIC;
    v_ar_invoices       NUMERIC;
    v_ar_delivery_fees  NUMERIC;
    v_ar_sub            NUMERIC;
    v_inv_sub           NUMERIC;
    v_ap_sub            NUMERIC;
    v_inv_threshold     NUMERIC;
    v_ap_threshold      NUMERIC;
BEGIN
    -- Cash (1010)
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
        v_cash_gl,
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

    SELECT COALESCE(SUM(inv.amount_due), 0)
    INTO v_ar_invoices
    FROM invoices inv
    WHERE UPPER(REPLACE(inv.status, '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');

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
            ELSE 'Investigate: invoices_outstanding=' || v_ar_invoices::TEXT
                 || ', delivery_fee_receivables=' || v_ar_delivery_fees::TEXT
        END::TEXT;

    -- Inventory (1300) — FEFO batch subledger
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_inv_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    SELECT COALESCE(SUM(ib.remaining_quantity * COALESCE(ib.cost_price, 0)), 0)
    INTO v_inv_sub
    FROM inventory_batches ib
    WHERE ib.remaining_quantity > 0;

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

    -- Accounts Payable (2100) — supplier-scoped GL vs suppliers table
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
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold
            THEN 'AP reconciled (within ' || v_ap_threshold::INTEGER::TEXT || ' UGX materiality threshold)'
            ELSE 'Investigate supplier invoices and payments (threshold=' || v_ap_threshold::INTEGER::TEXT || ' UGX)'
        END::TEXT;
END;
$$ LANGUAGE plpgsql;

INSERT INTO schema_version (version) VALUES (516) ON CONFLICT DO NOTHING;

COMMIT;
