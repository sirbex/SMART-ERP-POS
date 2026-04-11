-- ============================================================================
-- SAP FAGLFLEXT-Style Period Totals Table
-- 
-- PURPOSE: Pre-aggregated account balances per fiscal period.
-- All financial reports (P&L, Trial Balance, Balance Sheet, Cash Flow)
-- read from this table instead of scanning ledger_entries.
--
-- MAINTENANCE: Updated inside the same DB transaction that posts GL entries.
-- No triggers. No materialized views. Service-layer controlled.
-- ============================================================================

-- 1. Create the totals table
CREATE TABLE IF NOT EXISTS gl_period_balances (
    account_id     UUID           NOT NULL REFERENCES accounts("Id"),
    fiscal_year    INT            NOT NULL,
    fiscal_period  INT            NOT NULL CHECK (fiscal_period BETWEEN 0 AND 16),
    opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
    debit_total    NUMERIC(18,2)  NOT NULL DEFAULT 0,
    credit_total   NUMERIC(18,2)  NOT NULL DEFAULT 0,
    running_balance NUMERIC(18,2) NOT NULL DEFAULT 0,
    last_updated   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    PRIMARY KEY (account_id, fiscal_year, fiscal_period),
    CONSTRAINT chk_running_balance_invariant
      CHECK (running_balance = opening_balance + debit_total - credit_total)
);

-- Period 0 = opening balance carry-forward from prior year close
-- Periods 1-12 = standard months (Jan-Dec)
-- Periods 13-16 = special periods (year-end adjustments per SAP convention)

COMMENT ON TABLE gl_period_balances IS 'SAP FAGLFLEXT-style period totals. Updated atomically with ledger_entries inserts.';
COMMENT ON COLUMN gl_period_balances.fiscal_period IS '0=opening balance, 1-12=months, 13-16=special periods';
COMMENT ON COLUMN gl_period_balances.opening_balance IS 'Carry-forward balance from prior periods. Set by carryForwardBalances() for period 0, zero for in-period rows.';
COMMENT ON COLUMN gl_period_balances.running_balance IS 'opening_balance + debit_total - credit_total (invariant enforced by CHECK constraint)';

-- 2. Composite index for period-range queries (reports)
CREATE INDEX IF NOT EXISTS idx_gl_period_balances_year_period
    ON gl_period_balances (fiscal_year, fiscal_period);

-- 3. Index for single-account lookups (account drill-down)
CREATE INDEX IF NOT EXISTS idx_gl_period_balances_account
    ON gl_period_balances (account_id, fiscal_year);

-- ============================================================================
-- BACKFILL: Populate from existing ledger_entries
-- Run this ONCE after creating the table, then the service layer maintains it.
-- ============================================================================
INSERT INTO gl_period_balances (account_id, fiscal_year, fiscal_period, debit_total, credit_total, running_balance, last_updated)
SELECT
    le."AccountId"                                          AS account_id,
    EXTRACT(YEAR  FROM lt."TransactionDate")::INT           AS fiscal_year,
    EXTRACT(MONTH FROM lt."TransactionDate")::INT           AS fiscal_period,
    COALESCE(SUM(le."DebitAmount"),  0)                     AS debit_total,
    COALESCE(SUM(le."CreditAmount"), 0)                     AS credit_total,
    COALESCE(SUM(le."DebitAmount"),  0) - COALESCE(SUM(le."CreditAmount"), 0) AS running_balance,
    NOW()                                                   AS last_updated
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
WHERE lt."Status" = 'POSTED'
GROUP BY le."AccountId",
         EXTRACT(YEAR  FROM lt."TransactionDate")::INT,
         EXTRACT(MONTH FROM lt."TransactionDate")::INT
ON CONFLICT (account_id, fiscal_year, fiscal_period) DO UPDATE SET
    debit_total     = EXCLUDED.debit_total,
    credit_total    = EXCLUDED.credit_total,
    running_balance = EXCLUDED.running_balance,
    last_updated    = NOW();
