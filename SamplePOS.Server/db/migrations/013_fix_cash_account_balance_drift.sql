-- ============================================================
-- Migration 013: Fix cash account (1010) CurrentBalance drift
-- Date: 2026-05
-- Issue: accounts.CurrentBalance for Cash (1010) is exactly 305,000 higher
--        than the sum of all ledger_entries for that account.
--
-- Root Cause (forensic investigation):
--   The 305,000 phantom balance was present in accounts.CurrentBalance
--   BEFORE the first real GL entry was posted on 2026-04-04.
--   All migration scripts (safe_data_reset.sql, clear-ledger.sql, etc.)
--   should have zeroed CurrentBalance on 2026-04-03, but the balance
--   was re-set to 305,000 manually via a direct psql UPDATE during
--   go-live setup (likely as an opening cash float) without creating
--   a corresponding ledger_entry. The bash history was cleared so the
--   exact command cannot be recovered.
--
-- Effect: Cash reconciliation always shows 305,000 STORED_BALANCE drift.
--         Every cash report overstates actual cash by exactly 305,000.
--
-- Fix: Resync accounts.CurrentBalance for account 1010 from its GL entries
--      (single source of truth). This is a one-way, irreversible correction.
--      The 305,000 has no corresponding ledger_entry and is phantom money.
--
-- Verification: After applying, the reconciliation tool should show
--               MATCHED for Cash (no STORED_BALANCE discrepancy).
-- ============================================================

BEGIN;

-- ===== PRE-FLIGHT CHECK =====
DO $$
DECLARE
  v_stored   NUMERIC;
  v_gl_sum   NUMERIC;
  v_drift    NUMERIC;
  v_acct_id  UUID;
BEGIN
  SELECT "Id", "CurrentBalance"
    INTO v_acct_id, v_stored
    FROM accounts
    WHERE "AccountCode" = '1010';

  IF v_acct_id IS NULL THEN
    RAISE EXCEPTION 'Account 1010 (Cash) not found — aborting';
  END IF;

  SELECT COALESCE(SUM("DebitAmount") - SUM("CreditAmount"), 0)
    INTO v_gl_sum
    FROM ledger_entries
    WHERE "AccountId" = v_acct_id;

  v_drift := v_stored - v_gl_sum;

  RAISE NOTICE 'Account 1010 — stored: %, GL sum: %, drift: %', v_stored, v_gl_sum, v_drift;

  IF v_drift = 0 THEN
    RAISE EXCEPTION 'Drift is already 0 — migration may have already been applied, or no drift exists. Aborting to prevent double-apply.';
  END IF;

  IF v_drift NOT BETWEEN 200000 AND 400000 THEN
    RAISE EXCEPTION 'Unexpected drift amount: %. Expected ~305000. Aborting — manual review required.', v_drift;
  END IF;

  RAISE NOTICE 'Pre-flight passed. Drift = %. Proceeding with balance correction.', v_drift;
END $$;

-- ===== APPLY FIX =====
UPDATE accounts
SET
  "CurrentBalance" = (
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    FROM ledger_entries le
    WHERE le."AccountId" = accounts."Id"
  ),
  "UpdatedAt" = NOW()
WHERE "AccountCode" = '1010';

-- ===== POST-APPLY VERIFICATION =====
DO $$
DECLARE
  v_stored   NUMERIC;
  v_gl_sum   NUMERIC;
  v_drift    NUMERIC;
  v_acct_id  UUID;
BEGIN
  SELECT "Id", "CurrentBalance"
    INTO v_acct_id, v_stored
    FROM accounts
    WHERE "AccountCode" = '1010';

  SELECT COALESCE(SUM("DebitAmount") - SUM("CreditAmount"), 0)
    INTO v_gl_sum
    FROM ledger_entries
    WHERE "AccountId" = v_acct_id;

  v_drift := v_stored - v_gl_sum;

  IF v_drift != 0 THEN
    RAISE EXCEPTION 'Post-apply drift check FAILED: drift = %. Expected 0. Rolling back.', v_drift;
  END IF;

  RAISE NOTICE 'Post-apply PASSED: account 1010 CurrentBalance = % (matches GL sum)', v_stored;
END $$;

COMMIT;
