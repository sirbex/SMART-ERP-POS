-- ============================================================
-- 254: SAP GLT0-Equivalent Sales Daily Summary (Rollup Table)
-- ============================================================
-- Purpose: Pre-aggregated sales totals updated atomically inside
-- the sale transaction. Eliminates full-table scans on `sales`
-- for dashboard KPIs — O(days × payment_methods) instead of O(sales).
--
-- SAP equivalent: GLT0 (General Ledger Totals)
-- Odoo equivalent: sale_report with store=True computed fields
-- ============================================================

CREATE TABLE IF NOT EXISTS sales_daily_summary (
    sale_date         DATE         NOT NULL,
    payment_method    VARCHAR(50)  NOT NULL,
    transaction_count INTEGER      NOT NULL DEFAULT 0,
    total_amount      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_cost        NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_profit      NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_discounts   NUMERIC(15,2) NOT NULL DEFAULT 0,
    credit_count      INTEGER      NOT NULL DEFAULT 0,
    partial_payment_count INTEGER  NOT NULL DEFAULT 0,
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    PRIMARY KEY (sale_date, payment_method)
);

-- Index for date-range queries (dashboard filters)
CREATE INDEX IF NOT EXISTS idx_sales_daily_summary_date
    ON sales_daily_summary (sale_date);

-- ============================================================
-- Backfill from existing sales data (idempotent)
-- ============================================================
INSERT INTO sales_daily_summary (
    sale_date,
    payment_method,
    transaction_count,
    total_amount,
    total_cost,
    total_profit,
    total_discounts,
    credit_count,
    partial_payment_count,
    updated_at
)
SELECT
    sale_date,
    payment_method,
    COUNT(*)::INTEGER                                               AS transaction_count,
    COALESCE(SUM(total_amount), 0)                                  AS total_amount,
    COALESCE(SUM(total_cost), 0)                                    AS total_cost,
    COALESCE(SUM(total_amount - COALESCE(total_cost, 0)), 0)        AS total_profit,
    COALESCE(SUM(discount_amount), 0)                               AS total_discounts,
    COUNT(*) FILTER (WHERE payment_method = 'CREDIT')::INTEGER      AS credit_count,
    COUNT(*) FILTER (WHERE payment_method = 'CREDIT'
        AND amount_paid > 0
        AND amount_paid < total_amount)::INTEGER                    AS partial_payment_count,
    NOW()                                                           AS updated_at
FROM sales
WHERE status = 'COMPLETED'
GROUP BY sale_date, payment_method
ON CONFLICT (sale_date, payment_method) DO UPDATE SET
    transaction_count     = EXCLUDED.transaction_count,
    total_amount          = EXCLUDED.total_amount,
    total_cost            = EXCLUDED.total_cost,
    total_profit          = EXCLUDED.total_profit,
    total_discounts       = EXCLUDED.total_discounts,
    credit_count          = EXCLUDED.credit_count,
    partial_payment_count = EXCLUDED.partial_payment_count,
    updated_at            = NOW();
