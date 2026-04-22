-- Migration 017: Fix uq_ledger_transactions_reference constraint
--
-- PROBLEM:
--   The "uq_ledger_transactions_reference" constraint enforces
--   UNIQUE ("ReferenceType", "ReferenceId") on ledger_transactions.
--
--   Migration 013 split the sale journal into two:
--     1. Revenue journal  — referenceType='SALE',      referenceId=saleId
--     2. COGS journal     — referenceType='SALE',      referenceId=saleId
--   Both use the same (ReferenceType, ReferenceId) pair, violating the constraint.
--   This caused every sale with inventory COGS to fail GL posting with:
--     "duplicate key value violates unique constraint uq_ledger_transactions_reference"
--
-- FIX:
--   1. Drop the overly-restrictive reference uniqueness constraint.
--      Idempotency is still fully guaranteed by the separate
--      ledger_transactions_IdempotencyKey_key (UNIQUE "IdempotencyKey").
--   2. Replace with a non-unique index for lookup performance only.
--
-- SAFE: No business-logic changes. No data loss. Idempotency unaffected.

BEGIN;

-- Drop the constraint that blocks the split-journal design
ALTER TABLE ledger_transactions
  DROP CONSTRAINT IF EXISTS uq_ledger_transactions_reference;

-- Keep a non-unique index so queries filtering by (ReferenceType, ReferenceId) stay fast
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_reference
  ON ledger_transactions ("ReferenceType", "ReferenceId");

-- Record migration
INSERT INTO schema_version (version, applied_at)
SELECT 17, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 17);

COMMIT;
