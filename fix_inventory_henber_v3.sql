-- ============================================================
-- INVENTORY GL CORRECTIVE ENTRY — pos_tenant_henber_pharmacy
-- Date: 2026-05-31
-- Purpose: Correct GL Inventory (1300) balance to match true
--          batch subledger value.
--
-- Root causes (total corrective debit to 1300 computed live):
-- 1. COGS GL over-credits: GL posts COGS using FIFO-derived
--    sale_items.unit_cost; batches deduct at batch.cost_price.
--    UoM conversions and FIFO averaging create systematic
--    over-credits. Net ~29,581.
-- 2. RGRN-2026-0008 (Glucophage 1000mg): return line used
--    unit_cost=26,500 instead of batch cost_price=441.67.
--    GL over-credited 1300 by 26,058.33.
-- 3. RGRN-2026-0003 (Betapyn): return line had no batch_id,
--    batch not reduced but GL credited 695.
-- 4. Prednisolone void rounding: void SM 232.00 vs batch
--    232.14 × 20 units = 2.80 variance.
-- Total debit amount computed dynamically as
--   SUM(remaining_qty × cost_price) - GL balance from entries.
-- ============================================================

BEGIN;

-- Safety guard: verify gap is within expected range before proceeding
DO $$
DECLARE
  v_gl_balance NUMERIC;
  v_batch_value NUMERIC;
  v_gap NUMERIC;
BEGIN
  SELECT ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2)
  INTO v_gl_balance
  FROM ledger_entries le
  JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
  JOIN accounts a ON le."AccountId" = a."Id"
  WHERE a."AccountCode" = '1300';

  SELECT ROUND(SUM(remaining_quantity * cost_price), 2)
  INTO v_batch_value
  FROM inventory_batches
  WHERE remaining_quantity > 0;

  v_gap := v_batch_value - v_gl_balance;

  IF v_gap < 50000 OR v_gap > 65000 THEN
    RAISE EXCEPTION 'Safety check failed: inventory gap is % — expected between 50,000 and 65,000. Aborting.', v_gap;
  END IF;

  RAISE NOTICE 'Safety check passed: GL=%, batch=%, gap=%', v_gl_balance, v_batch_value, v_gap;
END $$;

-- Post corrective entry
DO $$
DECLARE
  v_account_1300 UUID;
  v_account_5020 UUID;
  v_txn_id UUID;
  v_ref_id UUID;
  v_gl_balance NUMERIC;
  v_batch_value NUMERIC;
  v_gap NUMERIC;
  v_txn_number TEXT;
BEGIN
  SELECT "Id" INTO v_account_1300 FROM accounts WHERE "AccountCode" = '1300';
  SELECT "Id" INTO v_account_5020 FROM accounts WHERE "AccountCode" = '5020';

  IF v_account_1300 IS NULL THEN
    RAISE EXCEPTION 'Account 1300 not found';
  END IF;
  IF v_account_5020 IS NULL THEN
    RAISE EXCEPTION 'Account 5020 not found';
  END IF;

  -- Compute exact gap (live)
  SELECT ROUND(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 2)
  INTO v_gl_balance
  FROM ledger_entries le
  JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
  JOIN accounts a ON le."AccountId" = a."Id"
  WHERE a."AccountCode" = '1300';

  SELECT ROUND(SUM(remaining_quantity * cost_price), 2)
  INTO v_batch_value
  FROM inventory_batches
  WHERE remaining_quantity > 0;

  v_gap := v_batch_value - v_gl_balance;

  -- Generate next TXN number
  SELECT 'TXN-' || LPAD(
    (COALESCE(MAX(CAST(REPLACE("TransactionNumber", 'TXN-', '') AS INTEGER)), 0) + 1)::TEXT,
    6, '0'
  )
  INTO v_txn_number
  FROM ledger_transactions
  WHERE "TransactionNumber" ~ '^TXN-[0-9]+$';

  v_txn_id := gen_random_uuid();
  v_ref_id := gen_random_uuid();  -- reference ID for this reconciliation document

  -- Insert corrective ledger transaction
  INSERT INTO ledger_transactions (
    "Id",
    "TransactionNumber",
    "ReferenceType",
    "ReferenceId",
    "ReferenceNumber",
    "Description",
    "TransactionDate",
    "TotalDebitAmount",
    "TotalCreditAmount",
    "Status",
    "IsReversed",
    "PostingSource",
    "CreatedAt",
    "UpdatedAt"
  ) VALUES (
    v_txn_id,
    v_txn_number,
    'INVENTORY_ADJUSTMENT',
    v_ref_id,
    v_txn_number,
    'Inventory GL corrective entry: reconcile account 1300 to batch subledger. '
      || 'Root causes: COGS cost-basis discrepancies (FIFO vs batch.cost_price, ~29,581), '
      || 'RGRN-2026-0008 Glucophage wrong unit_cost 26,500 vs 441.67 (gap 26,058.33), '
      || 'RGRN-2026-0003 Betapyn no-batch return (695.00), '
      || 'Prednisolone void rounding (2.80). '
      || 'Correction amount: ' || v_gap::TEXT,
    CURRENT_DATE,
    v_gap,
    v_gap,
    'POSTED',
    FALSE,
    'MANUAL_RECONCILIATION',
    NOW(),
    NOW()
  );

  -- DR Inventory 1300 (increase asset — inventory was understated)
  INSERT INTO ledger_entries (
    "Id",
    "TransactionId",
    "AccountId",
    "EntryType",
    "Amount",
    "DebitAmount",
    "CreditAmount",
    "LineNumber",
    "Description",
    "EntryDate",
    "CreatedAt"
  ) VALUES (
    gen_random_uuid(),
    v_txn_id,
    v_account_1300,
    'DEBIT',
    v_gap,
    v_gap,
    0,
    1,
    'Inventory GL correction: debit 1300 to reconcile to batch subledger',
    NOW(),
    NOW()
  );

  -- CR Purchase Price Variance 5020 (offset for over-stated COGS / wrong return costs)
  INSERT INTO ledger_entries (
    "Id",
    "TransactionId",
    "AccountId",
    "EntryType",
    "Amount",
    "DebitAmount",
    "CreditAmount",
    "LineNumber",
    "Description",
    "EntryDate",
    "CreatedAt"
  ) VALUES (
    gen_random_uuid(),
    v_txn_id,
    v_account_5020,
    'CREDIT',
    v_gap,
    0,
    v_gap,
    2,
    'Inventory GL correction: credit PPV 5020 to offset over-stated COGS and return unit_cost errors',
    NOW(),
    NOW()
  );

  -- Update CurrentBalance for both accounts
  UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_gap WHERE "AccountCode" = '1300';
  UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - v_gap WHERE "AccountCode" = '5020';

  RAISE NOTICE 'Corrective entry posted: % for amount %', v_txn_number, v_gap;
END $$;

COMMIT;

-- Verify: run reconciliation after fix
SELECT source, amount, difference, status FROM fn_reconcile_inventory();

-- Also show new account balances
SELECT "AccountCode", "AccountName", "CurrentBalance"
FROM accounts
WHERE "AccountCode" IN ('1300', '5020');
