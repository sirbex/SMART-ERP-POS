-- Update fn_reconcile_inventory to use inventory_batches as the canonical subledger.
-- BATCH_VALUATION gets the tight threshold (consistent with service layer integrity checks).
-- PRODUCT_VALUATION becomes informational (products.cost_price drifts when price updates
-- don't retroactively fix existing batch costs).

CREATE OR REPLACE FUNCTION fn_reconcile_inventory(p_as_of_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE(
    source      TEXT,
    description TEXT,
    amount      NUMERIC(18,6),
    difference  NUMERIC(18,6),
    status      TEXT,
    details     JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_balance      NUMERIC(18,6) := 0;
    v_inventory_value NUMERIC(18,6) := 0;
    v_batch_value     NUMERIC(18,6) := 0;
    v_batch_threshold NUMERIC(18,6);
BEGIN
    -- GL Inventory balance (Account 1300, all statuses)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- Batch valuation: authoritative FEFO subledger.
    -- GL COGS is posted using FEFO batch.cost_price, so this is the correct comparison.
    SELECT COALESCE(SUM(ib.remaining_quantity * ib.cost_price), 0)
    INTO v_batch_value
    FROM inventory_batches ib
    WHERE ib.remaining_quantity > 0;

    -- Product valuation: informational only.
    -- products.cost_price is updated on new GRs but does not retroactively update
    -- existing batch costs, so this value diverges from GL over time.
    SELECT COALESCE(SUM(p.quantity_on_hand * COALESCE(p.cost_price, 0)), 0)
    INTO v_inventory_value
    FROM products p
    WHERE p.quantity_on_hand > 0;

    -- Materiality threshold for BATCH_VALUATION: GREATEST(5000, 0.01% of GL)
    -- Absorbs unavoidable rounding from Decimal → float conversion at the Money boundary.
    v_batch_threshold := GREATEST(5000, ABS(v_gl_balance) * 0.0001);

    -- GL baseline row
    RETURN QUERY SELECT
        'GL_INVENTORY_BALANCE'::TEXT,
        'Inventory (1300) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;

    -- Batch valuation row (PRIMARY — authoritative subledger)
    RETURN QUERY SELECT
        'BATCH_VALUATION'::TEXT,
        'Sum of (remaining_quantity × cost_price) from inventory_batches'::TEXT,
        v_batch_value,
        v_gl_balance - v_batch_value,
        CASE
            WHEN ABS(v_gl_balance - v_batch_value) <= v_batch_threshold THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;

    -- Product valuation row (INFORMATIONAL — may drift from batch costs)
    RETURN QUERY SELECT
        'PRODUCT_VALUATION'::TEXT,
        'Sum of (quantity_on_hand × cost_price) from products table'::TEXT,
        v_inventory_value,
        v_gl_balance - v_inventory_value,
        CASE
            WHEN ABS(v_gl_balance - v_inventory_value) <= v_batch_threshold THEN 'MATCHED'
            ELSE 'INFORMATIONAL'
        END::TEXT,
        NULL::JSONB;
END;
$$;
