-- Migration 021: Add PostingSource column to ledger_transactions
-- 
-- Root cause: accountingCore.ts stamps PostingSource after creating a journal
-- entry (UPDATE ledger_transactions SET "PostingSource" = $2 WHERE "Id" = $1)
-- but the column was defined in SamplePOS.Server/db/migrations/004_posting_governance.sql
-- which uses a separate migration system never applied to tenant databases.
-- Result: every GL posting fails with "column PostingSource does not exist".

BEGIN;

ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS "PostingSource" TEXT DEFAULT NULL;

-- Record migration
INSERT INTO schema_version (version, applied_at)
SELECT 21, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 21);

COMMIT;
