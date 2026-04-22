-- Migration 022: Prevent duplicate GL journals for the same sale
-- ============================================================================
-- PROBLEM: glEntryService previously used UUID-based idempotency keys
-- (SALE-<uuid>).  Each retry of a failed sale generated a NEW UUID, giving
-- each retry a different key that passed the UNIQUE constraint.  This allowed
-- phantom GL journals to accumulate for a single sale (root-cause of the
-- Henber 2026-04-22 discrepancy: 8 phantom SALE journals for SALE-2026-1464).
--
-- FIX LAYERS:
--   Layer 1 (code, deployed):  GL now runs inside the sale's TX (txClient).
--   Layer 2 (code, deployed):  Idempotency keys changed to saleNumber (stable).
--   Layer 3 (code, deployed):  AccountingCore has a second-layer ref check.
--   Layer 4 (THIS MIGRATION):  DB-level unique constraint — final backstop.
--
-- STRATEGY:
-- A UNIQUE constraint on (ReferenceType, ReferenceNumber) for SALE and
-- SALE_COGS rows makes it physically impossible to have two GL journals for
-- the same sale regardless of which code path posts them.
--
-- Combined with Layer 1, the correct flow is:
--   TX-1: sale + GL both roll back → nothing committed.
--   TX-2: sale + GL both commit → unique constraint satisfied.
-- If Layer 1 regresses (GL outside TX):
--   TX-1: GL commits phantom → unique constraint: first phantom passes.
--   TX-2: GL tries to insert same reference → unique violation → ROLLBACK.
-- Result: still only ONE journal per sale (the phantom, not the real sale).
-- This at least stops runaway phantom accumulation (8→1 phantom).
--
-- PRE-FLIGHT: This script checks for existing violations before creating the
-- index.  If any tenant DB has duplicates the migration RAISES an exception
-- instead of silently corrupting the index.
-- ============================================================================

BEGIN;

-- ── Pre-flight check ────────────────────────────────────────────────────────
DO $$
DECLARE
    v_violation_count INTEGER;
    v_sample TEXT;
BEGIN
    SELECT
        COUNT(*),
        MIN('"' || "ReferenceType" || '" / "' || "ReferenceNumber" || '"')
    INTO v_violation_count, v_sample
    FROM (
        SELECT "ReferenceType", "ReferenceNumber", COUNT(*) AS cnt
        FROM ledger_transactions
        WHERE "ReferenceType" IN ('SALE', 'SALE_COGS')
        GROUP BY "ReferenceType", "ReferenceNumber"
        HAVING COUNT(*) > 1
    ) dupes;

    IF v_violation_count > 0 THEN
        RAISE EXCEPTION
            'Migration 022 ABORTED: % duplicate (ReferenceType, ReferenceNumber) pair(s) found in ledger_transactions. '
            'First example: %. '
            'Run cleanup script to remove phantoms before applying this migration.',
            v_violation_count, v_sample;
    END IF;

    RAISE NOTICE 'Pre-flight OK: no duplicate SALE/SALE_COGS reference pairs found.';
END $$;

-- ── Create the partial unique index ─────────────────────────────────────────
-- Scope: only SALE and SALE_COGS rows (other types like GOODS_RECEIPT, etc.
-- may legitimately share a ReferenceNumber with a SALE row).
-- CONCURRENTLY is not used here because migrations run during maintenance.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_sale_gl_reference
    ON ledger_transactions ("ReferenceType", "ReferenceNumber")
    WHERE "ReferenceType" IN ('SALE', 'SALE_COGS');

DO $$ BEGIN RAISE NOTICE 'Index uq_ledger_sale_gl_reference created successfully.'; END $$;

-- ── Record migration ─────────────────────────────────────────────────────────
INSERT INTO schema_version (version, applied_at)
SELECT 22, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 22);

COMMIT;
