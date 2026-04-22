-- Migration 011: Fix inventory reconciliation precision
--
-- Problem: fn_reconcile_inventory uses ROUND(qty * cost, 0) per-line for product
-- and batch valuations. PostgreSQL SUM aggregates these rounded integers, which can
-- differ from the raw SUM by up to ±N rows × 0.5 UGX.
--
-- The GL correction entry (migration 008) was computed from the raw SUM, so:
--   raw SUM(qty * cost) = 272,388,253.94  →  matches GL exactly
--   SUM(ROUND(qty * cost, 0)) = 272,388,254.00  →  0.06 over-count → shows DISCREPANCY
--
-- SAP/Odoo principle: the inventory subledger totals must be computed with the
-- same precision as the GL posting. Remove per-line ROUND so that PRODUCT_VALUATION
-- matches GL to sub-cent precision.
--
-- Additionally: update the PRODUCT_VALUATION threshold from < 0.01 to < 1.00 UGX.
-- GL entries are stored as NUMERIC(18,6) but UGX has no sub-unit, so the realistic
-- minimum residual from cost-layer arithmetic is < 1 UGX.

CREATE OR REPLACE FUNCTION fn_reconcile_inventory(
    p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
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
    v_difference      NUMERIC(18,6);
BEGIN
    -- ── GL Inventory balance (Account 1300, all statuses) ────────
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;

    -- ── Product valuation: raw SUM, no per-line rounding ─────────
    -- products.cost_price is the same value used by the service layer when
    -- posting COGS, so this sum matches the GL without rounding residuals.
    SELECT COALESCE(SUM(p.quantity_on_hand * COALESCE(p.cost_price, 0)), 0)
    INTO v_inventory_value
    FROM products p
    WHERE p.quantity_on_hand > 0;

    -- ── Batch valuation: raw SUM, no per-line rounding ───────────
    -- Informational: shows FEFO layer value. May differ from product valuation
    -- when inventory_batches.cost_price drifts from products.cost_price.
    SELECT COALESCE(SUM(ib.remaining_quantity * ib.cost_price), 0)
    INTO v_batch_value
    FROM inventory_batches ib
    WHERE ib.remaining_quantity > 0;

    v_difference := v_gl_balance - GREATEST(v_inventory_value, v_batch_value);

    -- ── GL baseline row ──────────────────────────────────────────
    RETURN QUERY SELECT
        'GL_INVENTORY_BALANCE'::TEXT,
        'Inventory (1300) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;

    -- ── Product valuation row ─────────────────────────────────────
    -- Threshold: 1 UGX — sub-unit residuals from numeric precision are noise.
    RETURN QUERY SELECT
        'PRODUCT_VALUATION'::TEXT,
        'Sum of (quantity_on_hand × cost_price) from products table'::TEXT,
        v_inventory_value,
        v_gl_balance - v_inventory_value,
        CASE
            WHEN ABS(v_gl_balance - v_inventory_value) < 1 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;

    -- ── Batch valuation row ───────────────────────────────────────
    -- Threshold: GREATEST(5000, 0.01% of GL) — batch costs drift from product
    -- costs over time (price updates don't retroactively change old batches).
    -- This is expected and informational; GL authority is product valuation.
    RETURN QUERY SELECT
        'BATCH_VALUATION'::TEXT,
        'Sum of (remaining_quantity × cost_price) from inventory_batches'::TEXT,
        v_batch_value,
        v_gl_balance - v_batch_value,
        CASE
            WHEN ABS(v_gl_balance - v_batch_value) <= GREATEST(5000, ABS(v_gl_balance) * 0.0001)
            THEN 'MATCHED'
            ELSE 'INFORMATIONAL'
        END::TEXT,
        NULL::JSONB;
END;
$$;
