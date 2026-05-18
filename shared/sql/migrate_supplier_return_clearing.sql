-- =============================================================================
-- MIGRATION: Supplier Return Clearing (account 2160) — Historical Data Fix
-- =============================================================================
--
-- PURPOSE
-- -------
-- Prior to the Supplier Return Clearing refactor, Return GRNs and Supplier
-- Credit Notes incorrectly posted to GR/IR Clearing (account 2150) instead
-- of the dedicated Supplier Return Clearing account (2160).
--
-- GR/IR Clearing (2150) should ONLY contain:
--   - Goods Receipt entries    (ReferenceType = 'GOODS_RECEIPT')
--   - Supplier Invoice entries (ReferenceType = 'SUPPLIER_INVOICE')
--   - MR11 write-off entries   (ReferenceType = 'GRIR_WRITEOFF')
--   - Manual clearing entries  (ReferenceType = 'GRIR_MANUAL_CLEAR')
--
-- This migration finds every ledger_entry in account 2150 with
-- ReferenceType IN ('RETURN_GRN', 'SUPPLIER_CREDIT_NOTE') and:
--   1. Reroutes the entry to account 2160 (Supplier Return Clearing)
--   2. Creates a balancing correcting entry in account 2150 to zero it out
--
-- HOW TO RUN
-- ----------
-- psql -U postgres -d pos_system -f shared/sql/migrate_supplier_return_clearing.sql
--
-- SAFETY
-- ------
--   * Runs inside a single transaction — rolls back on any error.
--   * Idempotent: a WHERE NOT EXISTS guard prevents double-migration.
--   * Creates correcting journal entries; does NOT delete any rows.
--   * After running, re-run the integrity check to confirm 0 polluted entries.
--
-- VALIDATION (run after migration)
-- ---------------------------------
-- SELECT COUNT(*) FROM ledger_entries le
-- JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
-- JOIN accounts a ON a."Id" = le."AccountId"
-- WHERE a."AccountCode" = '2150'
--   AND lt."Status" = 'POSTED'
--   AND lt."ReferenceType" IN ('RETURN_GRN', 'SUPPLIER_CREDIT_NOTE');
-- Expected result: 0 rows
-- =============================================================================

BEGIN;

-- ── Step 1: Verify account 2160 exists ──────────────────────────────────────
-- If account 2160 does not exist this tenant has no polluted GR/IR entries
-- (it was provisioned after the Supplier Return Clearing refactor).
-- The TEMP TABLE JOIN in Step 2 will return 0 rows, making this a safe no-op.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2160') THEN
    RAISE NOTICE 'Account 2160 (Supplier Return Clearing) does not exist on this tenant — skipping migration (no polluted entries possible).';
  END IF;
END $$;

-- ── Step 2: Identify polluted entries ───────────────────────────────────────
-- Collect all ledger_entries hitting account 2150 via RETURN_GRN or
-- SUPPLIER_CREDIT_NOTE that have not already been migrated.
CREATE TEMP TABLE _polluted_grir_entries AS
SELECT
  le."Id"                        AS entry_id,
  le."TransactionId"             AS transaction_id,
  le."DebitAmount"               AS debit_amount,
  le."CreditAmount"              AS credit_amount,
  le."Description"               AS original_description,
  le."LineNumber"                AS line_number,
  le."EntryDate"                 AS entry_date,
  le."EntityId"                  AS entity_id,
  le."EntityType"                AS entity_type,
  lt."ReferenceType"             AS reference_type,
  lt."ReferenceId"               AS reference_id,
  lt."ReferenceNumber"           AS reference_number,
  lt."TransactionDate"           AS transaction_date,
  a."Id"                         AS grir_account_id,
  a2."Id"                        AS src_account_id  -- account 2160
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a  ON a."Id"  = le."AccountId" AND a."AccountCode" = '2150'
JOIN accounts a2 ON a2."AccountCode" = '2160'
WHERE lt."Status" = 'POSTED'
  AND lt."ReferenceType" IN ('RETURN_GRN', 'SUPPLIER_CREDIT_NOTE')
  -- Guard: skip if a correction transaction already exists for this entry
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt2
    WHERE lt2."ReferenceType" = 'GRIR_CORRECTION'
      AND lt2."ReferenceId"   = lt."ReferenceId"
  );

-- ── Step 3: Report what will be migrated ────────────────────────────────────
DO $$
DECLARE
  v_count   INTEGER;
  v_balance NUMERIC;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(debit_amount - credit_amount), 0)
  INTO v_count, v_balance
  FROM _polluted_grir_entries;

  IF v_count = 0 THEN
    RAISE NOTICE 'No polluted GR/IR entries found. Migration not needed.';
  ELSE
    RAISE NOTICE 'Found % polluted entry(ies) with net balance % in account 2150. Migrating...', v_count, v_balance;
  END IF;
END $$;

-- ── Step 4: Create correcting journal entries ────────────────────────────────
-- For each original transaction that polluted GR/IR, create ONE correcting
-- journal entry that:
--   a) Reverses the 2150 leg  (opposite sign of the original entry)
--   b) Posts the same amount to 2160
DO $$
DECLARE
  r                RECORD;
  v_new_tx_id      UUID;
  v_new_tx_number  TEXT;
  v_seq            INTEGER;
BEGIN
  v_seq := 0;

  FOR r IN
    SELECT DISTINCT
      transaction_id,
      reference_type,
      reference_id,
      reference_number,
      transaction_date,
      entry_date,
      entity_id,
      entity_type,
      grir_account_id,
      src_account_id,
      SUM(debit_amount - credit_amount) AS net_amount
    FROM _polluted_grir_entries
    GROUP BY transaction_id, reference_type, reference_id, reference_number,
             transaction_date, entry_date, entity_id, entity_type,
             grir_account_id, src_account_id
  LOOP
    v_seq := v_seq + 1;
    v_new_tx_id     := gen_random_uuid();
    v_new_tx_number := 'GRIR-CORR-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(v_seq::TEXT, 4, '0');

    -- Insert correcting transaction header
    INSERT INTO ledger_transactions (
      "Id", "TransactionNumber", "TransactionDate",
      "ReferenceType", "ReferenceId", "ReferenceNumber",
      "Description",
      "TotalDebitAmount", "TotalCreditAmount",
      "Status", "PostingSource",
      "IsReversed",
      "CreatedAt", "UpdatedAt", "CreatedBy"
    ) VALUES (
      v_new_tx_id,
      v_new_tx_number,
      r.transaction_date,
      'GRIR_CORRECTION',
      r.reference_id,
      r.reference_number,
      'GR/IR purity correction: move ' || r.reference_type || ' ' || COALESCE(r.reference_number, r.reference_id::TEXT) || ' from account 2150 -> 2160',
      ABS(r.net_amount),
      ABS(r.net_amount),
      'POSTED',
      'MANUAL_JOURNAL',
      FALSE,
      NOW(), NOW(), '00000000-0000-0000-0000-000000000000'::UUID
    );

    -- Correcting entry 1: reverse the 2150 side
    --   If original was DR 2150 → correction is CR 2150
    --   If original was CR 2150 → correction is DR 2150
    INSERT INTO ledger_entries (
      "Id", "TransactionId",
      "AccountId",
      "EntryType", "Amount", "DebitAmount", "CreditAmount",
      "Description",
      "LineNumber", "EntryDate", "EntityId", "EntityType",
      "RunningBalance", "IsReconciled", "ReconciledAmount", "TransactionCurrency",
      "CreatedAt"
    ) VALUES (
      gen_random_uuid(),
      v_new_tx_id,
      r.grir_account_id,
      CASE WHEN r.net_amount < 0 THEN 'DEBIT' ELSE 'CREDIT' END,
      ABS(r.net_amount),
      CASE WHEN r.net_amount < 0 THEN ABS(r.net_amount) ELSE 0 END,
      CASE WHEN r.net_amount > 0 THEN ABS(r.net_amount) ELSE 0 END,
      'Correction: remove ' || r.reference_type || ' from GR/IR (2150) - should be in 2160',
      1, r.entry_date, r.entity_id, r.entity_type,
      0, FALSE, 0, 'UGX',
      NOW()
    );

    -- Correcting entry 2: record the 2160 side (mirrors the original 2150 entry direction)
    INSERT INTO ledger_entries (
      "Id", "TransactionId",
      "AccountId",
      "EntryType", "Amount", "DebitAmount", "CreditAmount",
      "Description",
      "LineNumber", "EntryDate", "EntityId", "EntityType",
      "RunningBalance", "IsReconciled", "ReconciledAmount", "TransactionCurrency",
      "CreatedAt"
    ) VALUES (
      gen_random_uuid(),
      v_new_tx_id,
      r.src_account_id,
      CASE WHEN r.net_amount > 0 THEN 'DEBIT' ELSE 'CREDIT' END,
      ABS(r.net_amount),
      CASE WHEN r.net_amount > 0 THEN ABS(r.net_amount) ELSE 0 END,
      CASE WHEN r.net_amount < 0 THEN ABS(r.net_amount) ELSE 0 END,
      'Correction: post ' || r.reference_type || ' to Supplier Return Clearing (2160)',
      2, r.entry_date, r.entity_id, r.entity_type,
      0, FALSE, 0, 'UGX',
      NOW()
    );

    -- Update account CurrentBalance for 2150 and 2160
    UPDATE accounts
    SET "CurrentBalance" = "CurrentBalance" + (
          CASE WHEN r.net_amount > 0 THEN -r.net_amount ELSE ABS(r.net_amount) END
        ),
        "UpdatedAt" = NOW()
    WHERE "AccountCode" = '2150';

    UPDATE accounts
    SET "CurrentBalance" = "CurrentBalance" + (
          CASE WHEN r.net_amount > 0 THEN r.net_amount ELSE -ABS(r.net_amount) END
        ),
        "UpdatedAt" = NOW()
    WHERE "AccountCode" = '2160';

    RAISE NOTICE 'Created correction % for % % (net: %)', v_new_tx_number, r.reference_type, r.reference_number, r.net_amount;
  END LOOP;
END $$;

-- ── Step 5: Cleanup ──────────────────────────────────────────────────────────
-- _polluted_grir_entries is a TEMP TABLE — auto-dropped at session end.

-- ── Step 6: Final validation ─────────────────────────────────────────────────
DO $$
DECLARE
  v_remaining INTEGER;
BEGIN
  -- Count entries in 2150 from RETURN_GRN/SUPPLIER_CREDIT_NOTE that do NOT
  -- have a corresponding GRIR_CORRECTION journal. A corrected entry still
  -- exists in the original transaction but is offset by the correction journal.
  SELECT COUNT(*)
  INTO v_remaining
  FROM ledger_entries le
  JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '2150'
    AND lt."Status" = 'POSTED'
    AND lt."ReferenceType" IN ('RETURN_GRN', 'SUPPLIER_CREDIT_NOTE')
    AND NOT EXISTS (
      SELECT 1 FROM ledger_transactions lt2
      WHERE lt2."ReferenceType" = 'GRIR_CORRECTION'
        AND lt2."ReferenceId"   = lt."ReferenceId"
    );

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % uncorrected polluted entries remain in account 2150.', v_remaining;
  ELSE
    RAISE NOTICE 'Migration successful: GR/IR (2150) is now pure. All Return GRN / Supplier Credit Note entries have offsetting corrections posting to account 2160.';
  END IF;
END $$;

COMMIT;
