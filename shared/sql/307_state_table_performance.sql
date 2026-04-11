-- ============================================================
-- 307: State Table Performance Indexes (100M-row scale)
-- ============================================================
-- Prerequisite: 306_state_tables.sql
--
-- Adds partial indexes for dashboard WHERE balance > 0 filters,
-- covering indexes for reporting aggregations, and temporal
-- indexes for AR/AP aging queries.
--
-- All CREATE INDEX IF NOT EXISTS — safe to re-run.
-- ============================================================

-- ============================================================
-- customer_balances: Dashboard AR + aging queries
-- ============================================================
-- Dashboard: SUM(balance) WHERE balance > 0
-- Without this: full table scan at 100M rows (30-60s)
-- With partial index: <100ms
CREATE INDEX IF NOT EXISTS idx_customer_balances_positive
    ON customer_balances (balance)
    WHERE balance > 0;

-- AR aging reports need temporal ordering
CREATE INDEX IF NOT EXISTS idx_customer_balances_last_invoice
    ON customer_balances (last_invoice_date DESC)
    WHERE balance > 0;

CREATE INDEX IF NOT EXISTS idx_customer_balances_last_payment
    ON customer_balances (last_payment_date DESC);

-- ============================================================
-- supplier_balances: Dashboard AP + aging queries
-- ============================================================
-- Dashboard: SUM(balance) WHERE balance > 0
CREATE INDEX IF NOT EXISTS idx_supplier_balances_positive
    ON supplier_balances (balance)
    WHERE balance > 0;

-- AP aging reports need temporal ordering
CREATE INDEX IF NOT EXISTS idx_supplier_balances_last_gr
    ON supplier_balances (last_gr_date DESC)
    WHERE balance > 0;

CREATE INDEX IF NOT EXISTS idx_supplier_balances_last_payment
    ON supplier_balances (last_payment_date DESC);

-- ============================================================
-- inventory_balances: Stock reports
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_inventory_balances_movement_date
    ON inventory_balances (last_movement_date DESC);

-- ============================================================
-- product_daily_summary: Revenue-by-category reporting
-- Covering index so report query is index-only scan
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_pds_date_category
    ON product_daily_summary (business_date, category)
    INCLUDE (revenue, cost_of_goods, gross_profit, units_sold, transaction_count);
