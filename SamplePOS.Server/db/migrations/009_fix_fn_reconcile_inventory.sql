-- Fix fn_reconcile_inventory: use products.cost_price (same source as GL COGS postings)
-- This ensures PRODUCT_VALUATION row matches GL balance exactly.
-- Root cause of prior mismatch: after migration 410, the function was updated to use
-- product_valuation.cost_price, but that table drifted from products.cost_price for
-- 4 products (total 77,826 difference). Since GL COGS is posted using products.cost_price,
-- the reconciliation must use the same source.

CREATE OR REPLACE FUNCTION fn_reconcile_inventory(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    source TEXT,
    description TEXT,
    amount NUMERIC(18,6),
    difference NUMERIC(18,6),
    status TEXT,
    details JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_inventory_value NUMERIC(18,6) := 0;
    v_batch_value NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
BEGIN
    -- Get GL Inventory balance (Account 1300) - all statuses
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- Product valuation: uses products.cost_price (same source as GL COGS postings)
    -- Note: products.quantity_on_hand is kept in sync with product_inventory.quantity_on_hand
    -- but products.cost_price is authoritative (matches what service layer uses for COGS).
    SELECT COALESCE(SUM(ROUND(quantity_on_hand * COALESCE(cost_price, 0), 0)), 0)
    INTO v_inventory_value
    FROM products
    WHERE quantity_on_hand > 0;

    -- Batch valuation (FEFO view, informational)
    SELECT COALESCE(SUM(ROUND(remaining_quantity * cost_price, 0)), 0)
    INTO v_batch_value
    FROM inventory_batches
    WHERE remaining_quantity > 0;

    v_difference := v_gl_balance - GREATEST(v_inventory_value, v_batch_value);

    RETURN QUERY SELECT
        'GL_INVENTORY_BALANCE'::TEXT,
        'Inventory (1300) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;

    RETURN QUERY SELECT
        'PRODUCT_VALUATION'::TEXT,
        'Sum of (quantity_on_hand x cost_price) from products table'::TEXT,
        v_inventory_value,
        v_gl_balance - v_inventory_value,
        CASE
            WHEN ABS(v_gl_balance - v_inventory_value) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;

    RETURN QUERY SELECT
        'BATCH_VALUATION'::TEXT,
        'Sum of (remaining_quantity x cost_price) from inventory_batches'::TEXT,
        v_batch_value,
        v_gl_balance - v_batch_value,
        CASE
            WHEN ABS(v_gl_balance - v_batch_value) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
END;
$$;
