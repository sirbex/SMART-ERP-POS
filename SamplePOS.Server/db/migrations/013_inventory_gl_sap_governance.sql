-- =============================================================================
-- Migration 013: Inventory ↔ GL SAP-Level Governance
-- =============================================================================
-- Purpose:
--   Enforce SAP-grade separation between inventory subledger (cost_layers,
--   inventory_batches) and GL account 1300 (Inventory). After this migration:
--
--     • Account 1300 accepts postings ONLY from sources:
--         - INVENTORY_MOVE           (the inventory engine — single source of truth)
--         - SYSTEM_CORRECTION        (auditor / drift-correction scripts)
--         - OPENING_BALANCE_WIZARD   (initial data-load wizard only)
--
--     • Account 2100 (Accounts Payable) is expanded to also accept
--       INVENTORY_MOVE, because the Goods Receipt flow posts the single
--       composite journal  DR 1300 / CR 2100  under INVENTORY_MOVE.
--
--     • Account 5000 (COGS) already accepts INVENTORY_MOVE. No change here;
--       SALES_INVOICE is retained only for backward compatibility with
--       pre-refactor data. New sale COGS postings now flow through
--       INVENTORY_MOVE via a split journal (see glEntryService.ts).
--
-- Backward compatibility:
--   This migration only UPDATEs the "AllowedSources" arrays. It does not
--   alter table schemas, rename columns, drop triggers, or touch historical
--   ledger entries. Existing transactions remain intact and queryable.
--
-- Idempotency:
--   Pure UPDATE statements keyed by AccountCode — safe to re-run.
-- =============================================================================

BEGIN;

-- 1300 Inventory — STRICT: only the inventory engine may post
UPDATE accounts SET
  "SystemAccountTag"   = 'INVENTORY',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['INVENTORY_MOVE', 'SYSTEM_CORRECTION', 'OPENING_BALANCE_WIZARD']
WHERE "AccountCode" = '1300' AND "IsActive" = TRUE;

-- 2100 Accounts Payable — add INVENTORY_MOVE so composite GR journal
--   (DR 1300 / CR 2100, source = INVENTORY_MOVE) can be posted atomically.
--   PURCHASE_BILL is retained for vendor-invoice-only postings.
UPDATE accounts SET
  "SystemAccountTag"   = 'ACCOUNTS_PAYABLE',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PURCHASE_BILL', 'PAYMENT_RECEIPT', 'INVENTORY_MOVE', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '2100' AND "IsActive" = TRUE;

-- 5000 COGS — ensure INVENTORY_MOVE is present; retain SALES_INVOICE for
--   backward compatibility with historical composite sale journals.
UPDATE accounts SET
  "SystemAccountTag"   = 'COGS',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['INVENTORY_MOVE', 'SALES_INVOICE', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '5000' AND "IsActive" = TRUE;

-- Sanity check: fail loudly if 1300 was not tagged. This protects against
-- tenant DBs that never ran 004_posting_governance.sql.
DO $$
DECLARE
  v_tag TEXT;
BEGIN
  SELECT "SystemAccountTag" INTO v_tag
  FROM accounts
  WHERE "AccountCode" = '1300' AND "IsActive" = TRUE
  LIMIT 1;

  IF v_tag IS DISTINCT FROM 'INVENTORY' THEN
    RAISE EXCEPTION
      'Migration 013 failed: account 1300 is not tagged as INVENTORY (got %). Run migration 004 first.',
      COALESCE(v_tag, '<null>');
  END IF;
END $$;

COMMIT;
