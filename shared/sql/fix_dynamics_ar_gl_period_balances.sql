-- =============================================================================
-- FIX: Rebuild gl_period_balances for AR (1200) on pos_tenant_dynamics
--
-- ROOT CAUSE:
--   Old INVOICE_PAYMENT code path posted credits to ledger_entries but never
--   wrote the corresponding update to gl_period_balances. This caused the
--   balance sheet to show AR = 12,955,996 instead of the correct 7,955,996.
--
--   Additionally, gl_period_balances had a stale period 3 (March 2026) row
--   that doesn't correspond to any ledger_entries (all AR activity is in
--   period 4 / April 2026 per ledger_entries.EntryDate).
--
-- EFFECT:
--   Before: gl_period_balances net for 1200 = 12,955,996 (balance sheet value)
--   After:  gl_period_balances net for 1200 = 7,955,996 (matches GL and invoices)
--
-- VERIFICATION (run before + after):
--   SELECT SUM(debit_total)-SUM(credit_total) FROM gl_period_balances gpb
--   JOIN accounts a ON a."Id"=gpb.account_id WHERE a."AccountCode"='1200';
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------
-- Step 1: Remove the stale March 2026 period-3 row for account 1200
--         (no corresponding ledger_entries exist for this period)
-- -----------------------------------------------------------------------
DELETE FROM gl_period_balances
WHERE account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1200')
  AND fiscal_year = 2026
  AND fiscal_period = 3;

-- -----------------------------------------------------------------------
-- Step 2: Rebuild period 4 (April 2026) totals from actual ledger_entries
--         Must also update running_balance to satisfy chk_running_balance_invariant:
--           running_balance = opening_balance + debit_total - credit_total
-- -----------------------------------------------------------------------
UPDATE gl_period_balances
SET
  debit_total     = sub.debit_total,
  credit_total    = sub.credit_total,
  running_balance = gpb_cur.opening_balance + sub.debit_total - sub.credit_total,
  last_updated    = NOW()
FROM (
  SELECT
    COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE 0 END), 0) AS debit_total,
    COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) AS credit_total
  FROM ledger_entries le
  WHERE le."AccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1200')
    AND date_part('year',  le."EntryDate") = 2026
    AND date_part('month', le."EntryDate") = 4
) sub,
  gl_period_balances gpb_cur
WHERE gl_period_balances.account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1200')
  AND gl_period_balances.fiscal_year   = 2026
  AND gl_period_balances.fiscal_period = 4
  AND gpb_cur.account_id    = gl_period_balances.account_id
  AND gpb_cur.fiscal_year   = gl_period_balances.fiscal_year
  AND gpb_cur.fiscal_period = gl_period_balances.fiscal_period;

-- -----------------------------------------------------------------------
-- Step 3: Fix suppliers.OutstandingBalance for SURGIMED UGANDA LIMITED
--         GL (account 2100) shows 990,000 owed (GR-2026-0036, no payment),
--         but suppliers.OutstandingBalance was 0 (stale).
-- -----------------------------------------------------------------------
UPDATE suppliers
SET "OutstandingBalance" = 990000
WHERE "Id" = '2326ed7b-acf1-4822-8a82-e04193c9ad54';

COMMIT;

-- -----------------------------------------------------------------------
-- Verification queries
-- -----------------------------------------------------------------------

-- 1. gl_period_balances for 1200 after fix
SELECT
  gpb.fiscal_year, gpb.fiscal_period,
  gpb.debit_total, gpb.credit_total,
  (gpb.debit_total - gpb.credit_total) AS net
FROM gl_period_balances gpb
JOIN accounts a ON a."Id" = gpb.account_id
WHERE a."AccountCode" = '1200';

-- 2. Cumulative AR balance (should be 7,955,996)
SELECT
  SUM(debit_total) - SUM(credit_total) AS ar_gl_period_balance
FROM gl_period_balances gpb
JOIN accounts a ON a."Id" = gpb.account_id
WHERE a."AccountCode" = '1200';

-- 3. Cross-check: ledger_entries total (should still match)
SELECT
  SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE 0 END) AS total_debits,
  SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END) AS total_credits,
  SUM(CASE WHEN le."EntryType" = 'DEBIT'  THEN le."Amount" ELSE -le."Amount" END) AS net_ar
FROM ledger_entries le
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1200';

-- 4. Invoice sub-ledger (should also be 7,955,996)
SELECT SUM(amount_due) AS invoice_outstanding
FROM invoices
WHERE status NOT IN ('PAID','CANCELLED','VOID');

-- 5. Customer balances total (should be 7,955,996)
SELECT SUM(balance) AS customer_balance_total FROM customers WHERE balance > 0;

-- 6. SURGIMED OutstandingBalance after fix
SELECT "CompanyName", "OutstandingBalance"
FROM suppliers
WHERE "Id" = '2326ed7b-acf1-4822-8a82-e04193c9ad54';
