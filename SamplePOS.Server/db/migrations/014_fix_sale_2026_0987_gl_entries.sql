-- ============================================================
-- Migration 014: Fix malformed GL entries for SALE-2026-0987
-- Date: 2026-05
--
-- Root Cause:
--   Transaction SALE-2026-0987 (2026-04-23, CASH, 130,000 UGX) was posted
--   with two incorrect ledger_entry amounts, producing a −1,000 trial
--   balance imbalance (credits exceed debits by 1,000):
--
--   Bug 1 — Revenue line (4000) posted at 106,000 instead of 125,000
--     (sale subtotal). The 19,000 shortfall creates a +19,000 excess debit
--     on the Cash/Revenue pair.
--
--   Bug 2 — COGS line (5000) posted at 0 instead of 20,000 (items cost).
--     The missing debit creates a −20,000 excess credit on the COGS/
--     Inventory pair.
--
--   Net effect: +19,000 − 20,000 = −1,000 (credits exceed debits).
--   This is the sole source of the trial balance Difference = 1,000.
--
-- Actual sale record (sales + sale_items):
--   subtotal   = 125,000 UGX  (items_revenue)
--   tax_amount =   5,000 UGX  (VAT)
--   total      = 130,000 UGX  (amount_paid / Cash debit)
--   items_cost =  20,000 UGX  (COGS / Inventory)
--
-- Fix:
--   1. Correct Revenue CreditAmount: 106,000 → 125,000
--   2. Correct COGS   DebitAmount:         0 → 20,000
--   3. Resync CurrentBalance for accounts 4000 (Revenue) and 5000 (COGS)
--
-- Result after fix:
--   Dr Cash            130,000
--   Cr Sales Revenue   125,000
--   Cr VAT Payable       5,000
--   Cr Inventory        20,000
--   Dr COGS             20,000
--   Total Dr = 150,000 = Total Cr → BALANCED
-- ============================================================

BEGIN;

-- ===== PRE-FLIGHT CHECK =====
DO $$
DECLARE
  v_debit   NUMERIC;
  v_credit  NUMERIC;
  v_rev_cr  NUMERIC;
  v_cogs_dr NUMERIC;
BEGIN
  -- Verify the transaction exists and has the expected imbalance
  SELECT SUM(le."DebitAmount"), SUM(le."CreditAmount")
    INTO v_debit, v_credit
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  WHERE lt."ReferenceNumber" = 'SALE-2026-0987';

  IF v_debit IS NULL THEN
    RAISE EXCEPTION 'SALE-2026-0987 not found in ledger_entries — aborting';
  END IF;

  IF v_debit = v_credit THEN
    RAISE EXCEPTION 'SALE-2026-0987 is already balanced (Debit=Credit=%). Migration may already be applied.', v_debit;
  END IF;

  -- Verify the specific wrong values we expect to correct
  SELECT le."CreditAmount"
    INTO v_rev_cr
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE lt."ReferenceNumber" = 'SALE-2026-0987'
    AND a."AccountCode" = '4000';

  SELECT le."DebitAmount"
    INTO v_cogs_dr
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE lt."ReferenceNumber" = 'SALE-2026-0987'
    AND a."AccountCode" = '5000';

  IF v_rev_cr != 106000 THEN
    RAISE EXCEPTION 'Revenue credit is % (expected 106000) — unexpected state, aborting', v_rev_cr;
  END IF;

  IF v_cogs_dr != 0 THEN
    RAISE EXCEPTION 'COGS debit is % (expected 0) — unexpected state, aborting', v_cogs_dr;
  END IF;

  RAISE NOTICE 'Pre-flight passed. Debit=%, Credit=%, imbalance=%. Proceeding.', v_debit, v_credit, v_debit - v_credit;
END $$;

-- ===== FIX 1: Correct Revenue line (4000) CreditAmount 106,000 → 125,000 =====
UPDATE ledger_entries le
SET "CreditAmount" = 125000.000
FROM ledger_transactions lt,
     accounts a
WHERE le."TransactionId" = lt."Id"
  AND le."AccountId"     = a."Id"
  AND lt."ReferenceNumber" = 'SALE-2026-0987'
  AND a."AccountCode"      = '4000';

-- ===== FIX 2: Correct COGS line (5000) DebitAmount 0 → 20,000 =====
UPDATE ledger_entries le
SET "DebitAmount" = 20000.000
FROM ledger_transactions lt,
     accounts a
WHERE le."TransactionId" = lt."Id"
  AND le."AccountId"     = a."Id"
  AND lt."ReferenceNumber" = 'SALE-2026-0987'
  AND a."AccountCode"      = '5000';

-- ===== FIX 3: Resync CurrentBalance for Revenue (4000) and COGS (5000) =====
-- Use SUM(Debit) - SUM(Credit) consistent with accountingCore convention
UPDATE accounts
SET
  "CurrentBalance" = (
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    FROM ledger_entries le
    WHERE le."AccountId" = accounts."Id"
  ),
  "UpdatedAt" = NOW()
WHERE "AccountCode" IN ('4000', '5000');

-- ===== POST-APPLY VERIFICATION =====
DO $$
DECLARE
  v_debit  NUMERIC;
  v_credit NUMERIC;
BEGIN
  SELECT SUM(le."DebitAmount"), SUM(le."CreditAmount")
    INTO v_debit, v_credit
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  WHERE lt."ReferenceNumber" = 'SALE-2026-0987';

  IF v_debit != v_credit THEN
    RAISE EXCEPTION 'Post-apply check FAILED: Debit=%, Credit=%, imbalance=%. Rolling back.', v_debit, v_credit, v_debit - v_credit;
  END IF;

  RAISE NOTICE 'Post-apply PASSED: SALE-2026-0987 is balanced. Debit=Credit=%', v_debit;
END $$;

-- Verify global trial balance is now balanced
DO $$
DECLARE
  v_total_debit  NUMERIC;
  v_total_credit NUMERIC;
BEGIN
  SELECT SUM("DebitAmount"), SUM("CreditAmount")
    INTO v_total_debit, v_total_credit
  FROM ledger_entries;

  RAISE NOTICE 'Trial balance check: Total Debit=%, Total Credit=%, Difference=%',
    v_total_debit, v_total_credit, v_total_debit - v_total_credit;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RAISE EXCEPTION 'Trial balance still unbalanced after fix: difference=%. Rolling back.', v_total_debit - v_total_credit;
  END IF;

  RAISE NOTICE 'Trial balance BALANCED.';
END $$;

COMMIT;
