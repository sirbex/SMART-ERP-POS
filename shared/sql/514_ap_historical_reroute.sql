-- ============================================================================
-- Migration 514: Historical AP Re-routing — GRN → GRIR → AP
-- ============================================================================
-- For historical GRNs that posted directly to AP (2100) under the old
-- Odoo-style architecture, this migration creates corrective GL entries so
-- that the AP account only contains SUPPLIER_INVOICE entries going forward.
--
-- For each historical GRN with a linked supplier invoice:
--   Step A: Reversal  DR AP (2100) / CR GRIR Clearing (2150)  [removes old GRN credit from AP]
--   Step B: Invoice   DR GRIR Clearing (2150) / CR AP (2100)  [re-creates AP via SUPPLIER_INVOICE]
--
-- Net effect on AP balance: ZERO (AP stays identical)
-- Net effect on GRIR balance: ZERO (2150 nets to zero per GRN)
-- Audit trail: improved — AP now backed by SUPPLIER_INVOICE referenceType
--
-- ⚠️  RUN THIS MIGRATION IN A MAINTENANCE WINDOW.
-- ⚠️  Test on a tenant copy first, verify AP balances before/after.
-- ⚠️  After running, verify: SELECT SUM("CreditAmount") - SUM("DebitAmount")
--      FROM ledger_entries le JOIN accounts a ON a."Id" = le."AccountId"
--      WHERE a."AccountCode" = '2100' → must equal pre-migration AP balance.
-- ============================================================================

BEGIN;

-- ─── Safety check: verify AP balance before migration ────────────────────────
DO $$
DECLARE
  v_ap_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
  INTO v_ap_balance
  FROM ledger_entries le
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '2100';

  RAISE NOTICE '[514] AP balance before migration: %', v_ap_balance;
END $$;

-- ─── Create corrective journal entries for each historical GOODS_RECEIPT ─────
-- We insert directly into ledger_transactions + ledger_entries using the same
-- schema as AccountingCore.createJournalEntry(), bypassing application-layer
-- idempotency keys so we can operate in pure SQL.
--
-- We use the idempotency key prefix 'HIST_GRN_REROUTE-' to prevent re-running.

DO $$
DECLARE
  v_account_2100 UUID;
  v_account_2150 UUID;
  v_system_user  UUID;
  r              RECORD;
  v_txn_id       UUID;
  v_txn_number   TEXT;
  v_seq          INT := 0;
  v_idem_reversal TEXT;
  v_idem_invoice  TEXT;
BEGIN
  -- Resolve account IDs
  SELECT "Id" INTO v_account_2100 FROM accounts WHERE "AccountCode" = '2100' LIMIT 1;
  SELECT "Id" INTO v_account_2150 FROM accounts WHERE "AccountCode" = '2150' LIMIT 1;

  IF v_account_2100 IS NULL OR v_account_2150 IS NULL THEN
    RAISE EXCEPTION '[514] Cannot find account 2100 or 2150 — aborting migration';
  END IF;

  -- Use SYSTEM user UUID (first admin or placeholder)
  SELECT id INTO v_system_user FROM users WHERE role = 'ADMIN' LIMIT 1;
  IF v_system_user IS NULL THEN
    v_system_user := '00000000-0000-0000-0000-000000000000'::uuid;
  END IF;

  -- Process each historical GRN GL entry that credits AP directly
  FOR r IN
    SELECT DISTINCT
      lt."Id"              AS txn_id,
      lt."ReferenceId"     AS grn_id,
      lt."ReferenceNumber" AS grn_number,
      lt."EntryDate"       AS entry_date,
      le."CreditAmount"    AS amount,
      le."EntityId"        AS supplier_id,
      si."Id"              AS invoice_id,
      si."SupplierInvoiceNumber" AS invoice_number,
      si."InvoiceDate"     AS invoice_date
    FROM ledger_transactions lt
    JOIN ledger_entries le ON le."TransactionId" = lt."Id"
    JOIN accounts a        ON a."Id" = le."AccountId"
    -- Must also have a linked supplier invoice via junction table
    JOIN supplier_invoice_grn_links sigl ON sigl.grn_id = lt."ReferenceId"
    JOIN supplier_invoices si ON si."Id" = sigl.invoice_id
    WHERE lt."ReferenceType" = 'GOODS_RECEIPT'
      AND a."AccountCode" = '2100'
      AND le."CreditAmount" > 0
      AND lt."Status" = 'POSTED'
      -- Skip already-processed GRNs
      AND NOT EXISTS (
        SELECT 1 FROM ledger_transactions lt2
        WHERE lt2."IdempotencyKey" = 'HIST_GRN_REROUTE-REV-' || lt."ReferenceId"::text
      )
  LOOP
    v_seq := v_seq + 1;
    v_idem_reversal := 'HIST_GRN_REROUTE-REV-' || r.grn_id::text;
    v_idem_invoice  := 'HIST_GRN_REROUTE-INV-' || r.invoice_id::text;

    -- ── Step A: Reversal — DR AP (2100) / CR GRIR Clearing (2150) ──────────
    -- Removes the old GOODS_RECEIPT credit from AP
    v_txn_number := 'HIST-REV-' || LPAD(v_seq::text, 6, '0');
    v_txn_id := gen_random_uuid();

    INSERT INTO ledger_transactions (
      "Id", "EntryDate", "Description", "ReferenceType", "ReferenceId",
      "ReferenceNumber", "Status", "PostingSource", "IdempotencyKey",
      "CreatedBy", "CreatedAt", "UpdatedAt", "TransactionNumber"
    ) VALUES (
      v_txn_id,
      r.entry_date,
      'Historical correction: remove GRN ' || r.grn_number || ' from AP → GRIR',
      'SYSTEM_CORRECTION',
      r.grn_id,
      v_txn_number,
      'POSTED',
      'SYSTEM_CORRECTION',
      v_idem_reversal,
      v_system_user,
      NOW(), NOW(),
      v_txn_number
    );

    INSERT INTO ledger_entries (
      "Id", "TransactionId", "AccountId", "EntryDate",
      "DebitAmount", "CreditAmount", "Description",
      "EntityType", "EntityId", "CreatedAt"
    ) VALUES
    -- DR AP (2100)
    (gen_random_uuid(), v_txn_id, v_account_2100, r.entry_date,
     r.amount, 0, 'Historical: remove GRN ' || r.grn_number || ' from AP',
     'supplier', r.supplier_id, NOW()),
    -- CR GRIR Clearing (2150)
    (gen_random_uuid(), v_txn_id, v_account_2150, r.entry_date,
     0, r.amount, 'Historical: route GRN ' || r.grn_number || ' through GRIR',
     'supplier', r.supplier_id, NOW());

    -- ── Step B: Invoice — DR GRIR Clearing (2150) / CR AP (2100) ───────────
    -- Re-creates AP via SUPPLIER_INVOICE referenceType
    -- Only if not already done (idempotency)
    IF NOT EXISTS (
      SELECT 1 FROM ledger_transactions lt3
      WHERE lt3."IdempotencyKey" = v_idem_invoice
    ) THEN
      v_seq := v_seq + 1;
      v_txn_number := 'HIST-INV-' || LPAD(v_seq::text, 6, '0');
      v_txn_id := gen_random_uuid();

      INSERT INTO ledger_transactions (
        "Id", "EntryDate", "Description", "ReferenceType", "ReferenceId",
        "ReferenceNumber", "Status", "PostingSource", "IdempotencyKey",
        "CreatedBy", "CreatedAt", "UpdatedAt", "TransactionNumber"
      ) VALUES (
        v_txn_id,
        COALESCE(r.invoice_date, r.entry_date),
        'Historical correction: post invoice ' || r.invoice_number || ' to AP',
        'SUPPLIER_INVOICE',
        r.invoice_id,
        r.invoice_number,
        'POSTED',
        'PURCHASE_BILL',
        v_idem_invoice,
        v_system_user,
        NOW(), NOW(),
        v_txn_number
      );

      INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryDate",
        "DebitAmount", "CreditAmount", "Description",
        "EntityType", "EntityId", "CreatedAt"
      ) VALUES
      -- DR GRIR Clearing (2150)
      (gen_random_uuid(), v_txn_id, v_account_2150, COALESCE(r.invoice_date, r.entry_date),
       r.amount, 0, 'Historical: clear GRIR for invoice ' || r.invoice_number,
       'supplier', r.supplier_id, NOW()),
      -- CR AP (2100)
      (gen_random_uuid(), v_txn_id, v_account_2100, COALESCE(r.invoice_date, r.entry_date),
       0, r.amount, 'Historical: AP for invoice ' || r.invoice_number,
       'supplier', r.supplier_id, NOW());
    END IF;

  END LOOP;

  RAISE NOTICE '[514] Processed % historical GRN corrections', v_seq;
END $$;

-- ─── Safety check: verify AP balance AFTER migration (must be unchanged) ─────
DO $$
DECLARE
  v_ap_balance NUMERIC;
BEGIN
  SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
  INTO v_ap_balance
  FROM ledger_entries le
  JOIN accounts a ON a."Id" = le."AccountId"
  WHERE a."AccountCode" = '2100';

  RAISE NOTICE '[514] AP balance after migration: %', v_ap_balance;
  RAISE NOTICE '[514] If the two balances above differ, ROLLBACK immediately.';
END $$;

-- ─── Schema version ───────────────────────────────────────────────────────────
INSERT INTO schema_version (version, applied_at)
SELECT 514, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 514);

COMMIT;
