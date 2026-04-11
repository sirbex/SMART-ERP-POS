-- ============================================================================
-- gl_period_balances Safeguards Migration
-- Date: 2026-04-10
-- 
-- Three production-grade safeguards that complete the SAP FAGLFLEXT pattern:
--   1. opening_balance column — separate carry-forward from in-period movement
--   2. CHECK constraint — running_balance = opening_balance + debit_total - credit_total
--   3. Indexes for reconciliation job performance
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Add opening_balance column
--    Stores the carry-forward balance from prior year close (period 0 seed).
--    In-period rows (1-12) may have opening_balance = 0 unless manually set.
--    Invariant: running_balance = opening_balance + debit_total - credit_total
-- ============================================================================

ALTER TABLE gl_period_balances
  ADD COLUMN IF NOT EXISTS opening_balance NUMERIC(18,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN gl_period_balances.opening_balance
  IS 'Carry-forward balance from prior periods. Set by carryForwardBalances() for period 0, zero for in-period rows.';

-- ============================================================================
-- 2. Fix running_balance for all existing rows to include opening_balance
--    (opening_balance is 0 for all existing rows, so this is a no-op safety net)
-- ============================================================================

UPDATE gl_period_balances
SET running_balance = opening_balance + debit_total - credit_total
WHERE running_balance != opening_balance + debit_total - credit_total;

-- ============================================================================
-- 3. Add CHECK constraint: running_balance must always equal opening_balance + debit - credit
--    This makes drift mathematically impossible at the DB level.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_running_balance_invariant'
  ) THEN
    ALTER TABLE gl_period_balances
      ADD CONSTRAINT chk_running_balance_invariant
      CHECK (running_balance = opening_balance + debit_total - credit_total);
  END IF;
END $$;

-- ============================================================================
-- 4. Index for reconciliation job: fast per-account-period lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_gl_period_balances_recon
  ON gl_period_balances (account_id, fiscal_year, fiscal_period)
  INCLUDE (debit_total, credit_total, running_balance, opening_balance);

COMMIT;
