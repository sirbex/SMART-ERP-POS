-- ============================================================
-- CORRECTION: Void 5 orphaned REF entries for SALE-2026-0045
-- 
-- Root cause:
--   SALE-2026-0045 (3,600,000,000 UGX) was partially refunded
--   (5 REF entries, total 360,000,000) and then FULLY REVERSED
--   via REV-SALE-2026-0045 (3,600,000,000).  The full reversal
--   already zeroes out the original sale, but the 5 partial-refund
--   GL entries remained POSTED and were never themselves reversed.
--   This caused:
--     Cash      : -357,629,744  (should be ~+2,370,256)
--     Revenue   : over-debited by 360,000,000
--     Inventory : over-debited by  19,580,000
--     COGS      : over-credited by 19,580,000
--
-- Fix:
--   Create a single SYSTEM_CORRECTION transaction that is the exact
--   mirror-image of the aggregate of the 5 orphaned REF transactions.
--   This brings all 4 accounts back to their correct balances without
--   altering or deleting any historical records.
-- ============================================================

BEGIN;

DO $$
DECLARE
  v_txn_id       UUID;
  v_ref_id       UUID;
  v_cash_id      UUID;
  v_revenue_id   UUID;
  v_inventory_id UUID;
  v_cogs_id      UUID;
BEGIN

  -- Resolve account IDs
  SELECT "Id" INTO v_cash_id      FROM accounts WHERE "AccountCode" = '1010';
  SELECT "Id" INTO v_revenue_id   FROM accounts WHERE "AccountCode" = '4000';
  SELECT "Id" INTO v_inventory_id FROM accounts WHERE "AccountCode" = '1300';
  SELECT "Id" INTO v_cogs_id      FROM accounts WHERE "AccountCode" = '5000';

  -- Guard: all accounts must exist
  IF v_cash_id IS NULL OR v_revenue_id IS NULL OR v_inventory_id IS NULL OR v_cogs_id IS NULL THEN
    RAISE EXCEPTION 'One or more accounts not found (1010/4000/1300/5000)';
  END IF;

  -- Guard: idempotency – skip if already applied
  IF EXISTS (SELECT 1 FROM ledger_transactions WHERE "ReferenceNumber" = 'CORR-2026-SALE0045-REFVOID') THEN
    RAISE NOTICE 'Correction CORR-2026-SALE0045-REFVOID already applied – skipping.';
    RETURN;
  END IF;

  -- New stable UUID for this correction (used as ReferenceId)
  v_ref_id := gen_random_uuid();

  -- ── Create the correction ledger_transaction ──────────────
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
  )
  VALUES (
    gen_random_uuid(),
    (SELECT 'TXN-' || LPAD((CAST(SUBSTRING(MAX("TransactionNumber") FROM 5) AS INTEGER) + 1)::TEXT, 6, '0') FROM ledger_transactions),
    '2026-04-22 00:00:00+03',
    'JOURNAL_ENTRY',
    v_ref_id,
    'CORR-2026-SALE0045-REFVOID',
    'Correction: void 5 orphaned refund GL entries for SALE-2026-0045 (superseded by full reversal REV-SALE-2026-0045)',
    379580000.000000,   -- 360,000,000 cash + 19,580,000 COGS
    379580000.000000,   -- 360,000,000 revenue + 19,580,000 inventory
    'POSTED',
    false,
    'corr-sale0045-refvoid-20260422',
    NOW(),
    NOW()
  )
  RETURNING "Id" INTO v_txn_id;

  -- ── Insert the 4 correction ledger_entries ─────────────────
  -- Line 1: DR Cash 360,000,000  (restores cash reduced by orphaned refunds)
  INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType",
    "Amount", "DebitAmount", "CreditAmount",
    "Description", "LineNumber", "CreatedAt", "EntryDate"
  ) VALUES (
    gen_random_uuid(), v_txn_id, v_cash_id, 'DEBIT',
    360000000, 360000000, 0,
    'CORR: Restore cash – void orphaned refunds for SALE-2026-0045',
    1, NOW(), '2026-04-22 00:00:00+03'
  );

  -- Line 2: CR Revenue 360,000,000  (undoes the double revenue reversal)
  INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType",
    "Amount", "DebitAmount", "CreditAmount",
    "Description", "LineNumber", "CreatedAt", "EntryDate"
  ) VALUES (
    gen_random_uuid(), v_txn_id, v_revenue_id, 'CREDIT',
    360000000, 0, 360000000,
    'CORR: Restore revenue – void orphaned refunds for SALE-2026-0045',
    2, NOW(), '2026-04-22 00:00:00+03'
  );

  -- Line 3: DR COGS 19,580,000  (undoes the double COGS reversal)
  INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType",
    "Amount", "DebitAmount", "CreditAmount",
    "Description", "LineNumber", "CreatedAt", "EntryDate"
  ) VALUES (
    gen_random_uuid(), v_txn_id, v_cogs_id, 'DEBIT',
    19580000, 19580000, 0,
    'CORR: Restore COGS – void orphaned refunds for SALE-2026-0045',
    3, NOW(), '2026-04-22 00:00:00+03'
  );

  -- Line 4: CR Inventory 19,580,000  (corrects over-restored inventory)
  INSERT INTO ledger_entries (
    "Id", "TransactionId", "AccountId", "EntryType",
    "Amount", "DebitAmount", "CreditAmount",
    "Description", "LineNumber", "CreatedAt", "EntryDate"
  ) VALUES (
    gen_random_uuid(), v_txn_id, v_inventory_id, 'CREDIT',
    19580000, 0, 19580000,
    'CORR: Correct inventory – void orphaned refunds for SALE-2026-0045',
    4, NOW(), '2026-04-22 00:00:00+03'
  );

  RAISE NOTICE 'Correction transaction created: %', v_txn_id;
END $$;

-- ── Update CurrentBalance for all 4 affected accounts ────────
-- Use the all-statuses method (REVERSED entries pair with their reversals)
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
  JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
  WHERE le."AccountId" = a."Id"
)
WHERE a."AccountCode" IN ('1010', '4000', '1300', '5000');

-- ── Verify ───────────────────────────────────────────────────
DO $$
DECLARE
  v_cash      NUMERIC;
  v_revenue   NUMERIC;
  v_inventory NUMERIC;
  v_cogs      NUMERIC;
BEGIN
  SELECT "CurrentBalance" INTO v_cash      FROM accounts WHERE "AccountCode" = '1010';
  SELECT "CurrentBalance" INTO v_revenue   FROM accounts WHERE "AccountCode" = '4000';
  SELECT "CurrentBalance" INTO v_inventory FROM accounts WHERE "AccountCode" = '1300';
  SELECT "CurrentBalance" INTO v_cogs      FROM accounts WHERE "AccountCode" = '5000';

  RAISE NOTICE 'Post-correction balances:';
  RAISE NOTICE '  Cash      (1010): %', v_cash;
  RAISE NOTICE '  Revenue   (4000): %', v_revenue;
  RAISE NOTICE '  Inventory (1300): %', v_inventory;
  RAISE NOTICE '  COGS      (5000): %', v_cogs;

  IF v_cash < 0 THEN
    RAISE WARNING 'Cash is still negative (%). Investigate further.', v_cash;
  ELSE
    RAISE NOTICE 'Cash is now POSITIVE (%) – correction successful.', v_cash;
  END IF;
END $$;

COMMIT;
