-- Migration 018: Drop partial unique index blocking split-journal sales
--
-- PROBLEM:
--   A pre-existing partial unique index enforces:
--     UNIQUE ("ReferenceType", "ReferenceId") WHERE Status = 'POSTED'
--   This is the same logical constraint as uq_ledger_transactions_reference
--   (dropped in migration 017) but as a partial index instead of a constraint.
--
--   With the split-journal design (migration 013), both the revenue and COGS
--   journals for a sale used referenceType='SALE' + referenceId=saleId.
--   When both journals reached Status='POSTED', the partial index fired with:
--     "duplicate key value violates unique constraint idx_ledger_transactions_reference_unique"
--
-- FIX:
--   Drop the partial unique index. Idempotency is guaranteed by the
--   ledger_transactions_IdempotencyKey_key UNIQUE constraint.
--   The non-unique idx_ledger_transactions_reference (from migration 017)
--   is sufficient for query performance.
--
-- NOTE: After migration 013's split-journal fix and migration 017's glEntryService
--   update, COGS journals now use referenceType='SALE_COGS', so even if this
--   index were kept it would not fire on new sales. We drop it anyway for safety
--   and to prevent any edge-case failures.

BEGIN;

DROP INDEX IF EXISTS idx_ledger_transactions_reference_unique;

-- Record migration
INSERT INTO schema_version (version, applied_at)
SELECT 18, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 18);

COMMIT;
