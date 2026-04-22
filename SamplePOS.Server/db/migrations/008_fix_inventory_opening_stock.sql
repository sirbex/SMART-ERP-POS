-- ============================================================
-- MIGRATION 008: Fix Inventory Reconciliation Discrepancy
--
-- Root causes:
--   1. BATCH-TEST-001 (Brain Active Denk, 269,990 units) has
--      cost_price = 15,000 instead of the correct 979.
--      This inflated batch valuation from ~272M to 4,057,894,714.
--
--   2. The batch was created directly in the database (source_type=UNKNOWN)
--      without a proper GL posting for the opening stock. The GL account
--      1300 therefore reads only 5,856,338 while physical inventory
--      (products.quantity_on_hand × cost_price) is ~272M.
--      A prior remediation (ADJ-REMEDIATION-001, TXN-000131) attempted
--      to fix this but was immediately reversed (TXN-000140, REV-ADJ-
--      REMEDIATION-001). This migration re-applies the correction
--      for the full product-valuation amount, not just the sold portion.
--
-- Fixes:
--   A. Update inventory_batches.cost_price for BATCH-TEST-001 → 979
--   B. Create journal entry: DR Inventory 1300 / CR Opening Balance Equity 3050
--      Amount = (current product valuation) - (current GL balance)
--   C. Update accounts.CurrentBalance for 1300 and 3050
--   D. Sync gl_period_balances for 1300 and 3050
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_txn_id         UUID;
  v_ref_id         UUID;
  v_inv_id         UUID;
  v_equity_id      UUID;
  v_current_gl     NUMERIC(18,6);
  v_product_val    NUMERIC(18,6);
  v_correction_amt NUMERIC(18,6);
BEGIN

  -- ── Guard: idempotency ───────────────────────────────────────
  IF EXISTS (
    SELECT 1 FROM ledger_transactions
    WHERE "ReferenceNumber" = 'ADJ-OPENING-INV-BATCH-TEST-001'
  ) THEN
    RAISE NOTICE 'Migration 008 already applied – skipping.';
    RETURN;
  END IF;

  -- ── Resolve account IDs ──────────────────────────────────────
  SELECT "Id" INTO v_inv_id    FROM accounts WHERE "AccountCode" = '1300';
  SELECT "Id" INTO v_equity_id FROM accounts WHERE "AccountCode" = '3050';

  IF v_inv_id IS NULL OR v_equity_id IS NULL THEN
    RAISE EXCEPTION 'Accounts 1300 or 3050 not found';
  END IF;

  -- ── Step A: Fix BATCH-TEST-001 cost_price ───────────────────
  UPDATE inventory_batches
  SET cost_price = 979.00,
      updated_at = NOW()
  WHERE batch_number = 'BATCH-TEST-001'
    AND cost_price = 15000.00;

  RAISE NOTICE 'BATCH-TEST-001 cost_price updated from 15000 to 979';

  -- ── Step B: Compute correction amount ───────────────────────
  -- Target = SUM(products.quantity_on_hand × products.cost_price)
  -- (authoritative: uses product-level costs, not batch costs)
  SELECT COALESCE(SUM(quantity_on_hand * COALESCE(cost_price, 0)), 0)
  INTO v_product_val
  FROM products
  WHERE is_active = true;

  -- Current GL Inventory balance (all statuses – consistent with CurrentBalance)
  SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
  INTO v_current_gl
  FROM ledger_entries le
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '1300';

  v_correction_amt := v_product_val - v_current_gl;

  RAISE NOTICE 'Product valuation: %  GL: %  Correction needed: %',
    v_product_val, v_current_gl, v_correction_amt;

  IF v_correction_amt <= 0 THEN
    RAISE NOTICE 'No correction needed (GL >= product valuation). Skipping GL entry.';
    RETURN;
  END IF;

  -- ── Step C: Create the corrective journal transaction ────────
  v_ref_id := gen_random_uuid();

  INSERT INTO ledger_transactions (
    "Id",
    "TransactionNumber",
    "TransactionDate",
    "ReferenceType",
    "ReferenceId",
    "ReferenceNumber",
    "Description",
    "TotalDebitAmount",
    "TotalCreditAmount",
    "Status",
    "IsReversed",
    "IdempotencyKey",
    "CreatedAt",
    "UpdatedAt"
  ) VALUES (
    gen_random_uuid(),
    (SELECT 'TXN-' || LPAD(
      (CAST(SUBSTRING(MAX("TransactionNumber") FROM 5) AS INTEGER) + 1)::TEXT,
      6, '0')
     FROM ledger_transactions),
    '2026-04-22 00:00:00+03',
    'JOURNAL_ENTRY',
    v_ref_id,
    'ADJ-OPENING-INV-BATCH-TEST-001',
    'Opening stock correction: Brain Active Denk BATCH-TEST-001 (269,990 units × 979) was received without a GL posting. Brings Inventory GL into agreement with physical product valuation. Ref: migration 008.',
    v_correction_amt,
    v_correction_amt,
    'POSTED',
    false,
    'adj-opening-inv-batch-test-001-20260422',
    NOW(),
    NOW()
  )
  RETURNING "Id" INTO v_txn_id;

  -- Line 1: DR Inventory (1300)
  INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType",
    "Amount", "DebitAmount", "CreditAmount",
    "Description", "LineNumber", "CreatedAt", "EntryDate"
  ) VALUES (
    gen_random_uuid(), v_txn_id, v_inv_id, 'DEBIT',
    v_correction_amt, v_correction_amt, 0,
    'Opening stock correction: Inventory (1300) – BATCH-TEST-001',
    1, NOW(), '2026-04-22 00:00:00+03'
  );

  -- Line 2: CR Opening Balance Equity (3050)
  INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType",
    "Amount", "DebitAmount", "CreditAmount",
    "Description", "LineNumber", "CreatedAt", "EntryDate"
  ) VALUES (
    gen_random_uuid(), v_txn_id, v_equity_id, 'CREDIT',
    v_correction_amt, 0, v_correction_amt,
    'Opening stock correction: Opening Balance Equity (3050) – BATCH-TEST-001',
    2, NOW(), '2026-04-22 00:00:00+03'
  );

  RAISE NOTICE 'Correction journal entry created: %', v_txn_id;
END $$;

-- ── Step D: Update CurrentBalance for 1300 and 3050 ──────────
UPDATE accounts a
SET "CurrentBalance" = (
  SELECT
    CASE
      WHEN a."NormalBalance" = 'DEBIT'
        THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
      ELSE
        COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    END
  FROM ledger_entries le
  WHERE le."AccountId" = a."Id"
)
WHERE a."AccountCode" IN ('1300', '3050');

-- ── Step E: Sync gl_period_balances for 1300 and 3050 ────────
UPDATE gl_period_balances gpb
SET
    debit_total     = sub.new_dr,
    credit_total    = sub.new_cr,
    running_balance = sub.new_dr - sub.new_cr,
    last_updated    = NOW()
FROM (
  SELECT
    le."AccountId",
    EXTRACT(YEAR  FROM lt."TransactionDate")::INT AS yr,
    EXTRACT(MONTH FROM lt."TransactionDate")::INT AS mo,
    COALESCE(SUM(le."DebitAmount"),  0) AS new_dr,
    COALESCE(SUM(le."CreditAmount"), 0) AS new_cr
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" IN ('1300', '3050')
  GROUP BY le."AccountId",
           EXTRACT(YEAR  FROM lt."TransactionDate")::INT,
           EXTRACT(MONTH FROM lt."TransactionDate")::INT
) sub
WHERE gpb.account_id    = sub."AccountId"
  AND gpb.fiscal_year   = sub.yr
  AND gpb.fiscal_period = sub.mo;

-- ── Verify ────────────────────────────────────────────────────
DO $$
DECLARE
  v_gl         NUMERIC;
  v_prod_val   NUMERIC;
  v_batch_val  NUMERIC;
  v_equity_bal NUMERIC;
BEGIN
  SELECT "CurrentBalance" INTO v_gl         FROM accounts WHERE "AccountCode" = '1300';
  SELECT "CurrentBalance" INTO v_equity_bal FROM accounts WHERE "AccountCode" = '3050';

  SELECT COALESCE(SUM(quantity_on_hand * COALESCE(cost_price,0)), 0)
  INTO v_prod_val FROM products WHERE is_active = true;

  SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
  INTO v_batch_val FROM inventory_batches WHERE remaining_quantity > 0;

  RAISE NOTICE 'Post-migration inventory check:';
  RAISE NOTICE '  GL (1300):                   %', ROUND(v_gl, 0);
  RAISE NOTICE '  Product valuation:           %', ROUND(v_prod_val, 0);
  RAISE NOTICE '  Batch valuation (cost fixed): %', ROUND(v_batch_val, 0);
  RAISE NOTICE '  Opening Equity (3050):        %', ROUND(v_equity_bal, 0);
  RAISE NOTICE '  GL vs Product diff:           %', ROUND(v_gl - v_prod_val, 0);
  RAISE NOTICE '  GL vs Batch diff:             %', ROUND(v_gl - v_batch_val, 0);
END $$;

COMMIT;
