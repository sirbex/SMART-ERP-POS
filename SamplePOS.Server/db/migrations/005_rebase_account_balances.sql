-- ============================================================
-- MIGRATION 005: Rebase account CurrentBalance from ledger_entries
-- ============================================================
-- Root causes identified by reconciliation audit on 2026-04-22:
--
-- 1. AR (1200) -82,156 drift:
--    customerBalanceSync.ts and customerRepository.ts were directly
--    overwriting accounts."CurrentBalance" for AR with SUM(customers.balance),
--    bypassing AccountingCore. The code has been fixed (migration 005 code change).
--    This SQL corrects the residual balance to match the GL ledger.
--
-- 2. Cash (1010) +100 / Revenue (4000) +100:
--    A 100-unit cash sale appears in ledger_entries but the corresponding
--    CurrentBalance increment was lost (likely from an old direct manipulation).
--
-- 3. Inventory (1300) +50 / COGS (5000) -50:
--    Same cause — a 50-unit stock movement is in ledger_entries
--    but CurrentBalance was not updated atomically.
--
-- Fix: Rebase only the 5 affected accounts to their correct GL balance.
--      Formula: DEBIT-normal  => SUM(DebitAmount)  - SUM(CreditAmount)
--               CREDIT-normal => SUM(CreditAmount) - SUM(DebitAmount)
-- ============================================================

BEGIN;

-- Rebase only the 5 accounts with confirmed discrepancies
UPDATE accounts a
SET
  "CurrentBalance" = CASE
    WHEN a."NormalBalance" = 'DEBIT'
      THEN COALESCE(le_sum.net_debit, 0)
    ELSE
      COALESCE(le_sum.net_credit, 0)
  END,
  "UpdatedAt" = NOW()
FROM (
  SELECT
    "AccountId",
    SUM("DebitAmount") - SUM("CreditAmount") AS net_debit,
    SUM("CreditAmount") - SUM("DebitAmount") AS net_credit
  FROM ledger_entries
  GROUP BY "AccountId"
) le_sum
WHERE a."Id" = le_sum."AccountId"
  AND a."AccountCode" IN ('1010', '1200', '1300', '4000', '5000');

-- Verify the fix — all 5 should show 0 discrepancy
DO $$
DECLARE
  drift_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO drift_count
  FROM accounts a
  JOIN (
    SELECT
      "AccountId",
      SUM("DebitAmount") - SUM("CreditAmount") AS net_debit,
      SUM("CreditAmount") - SUM("DebitAmount") AS net_credit
    FROM ledger_entries
    GROUP BY "AccountId"
  ) le_sum ON a."Id" = le_sum."AccountId"
  WHERE a."AccountCode" IN ('1010', '1200', '1300', '4000', '5000')
    AND ABS(
      a."CurrentBalance" - CASE
        WHEN a."NormalBalance" = 'DEBIT' THEN le_sum.net_debit
        ELSE le_sum.net_credit
      END
    ) > 0.01;

  IF drift_count > 0 THEN
    RAISE EXCEPTION 'Balance rebase verification failed: % accounts still have drift', drift_count;
  END IF;
  RAISE NOTICE 'Balance rebase verified: all 5 accounts now match ledger_entries.';
END $$;

COMMIT;
