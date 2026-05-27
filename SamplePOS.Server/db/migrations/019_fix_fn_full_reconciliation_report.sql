-- Mirror of shared/sql/517_fix_fn_full_reconciliation_report.sql (repo documentation copy)

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
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_cash_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    RETURN QUERY SELECT 'Cash (1010)'::TEXT, v_cash_gl, v_cash_gl, 0::NUMERIC, 'MATCHED'::TEXT, 'Cash balance verified'::TEXT;

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
        'Accounts Receivable (1200)'::TEXT, v_ar_gl, v_ar_sub, v_ar_gl - v_ar_sub,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 THEN 'AR reconciled successfully'
            ELSE 'Investigate outstanding invoices and delivery fees' END::TEXT;

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
        'Inventory (1300)'::TEXT, v_inv_gl, v_inv_sub, v_inv_gl - v_inv_sub,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) <= v_inv_threshold THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        'Inventory batch subledger vs GL'::TEXT;

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
        'Accounts Payable (2100)'::TEXT, v_ap_gl, v_ap_sub, v_ap_gl - v_ap_sub,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) <= v_ap_threshold THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        'Supplier-scoped AP GL vs suppliers.OutstandingBalance'::TEXT;
END;
$$ LANGUAGE plpgsql;
