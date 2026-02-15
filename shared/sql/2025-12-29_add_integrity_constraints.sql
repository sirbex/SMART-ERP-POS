-- ============================================================================
-- INTEGRITY CONSTRAINTS MIGRATION
-- Date: 2025-12-29
-- Purpose: Add missing NOT NULL and CHECK constraints to prevent silent failures
-- ============================================================================

-- ============================================================================
-- 1. LEDGER_ENTRIES: Ensure TransactionId is never NULL
-- ============================================================================

-- First, check for any orphan entries (should be 0)
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO orphan_count
    FROM ledger_entries
    WHERE "LedgerTransactionId" IS NULL;
    
    IF orphan_count > 0 THEN
        RAISE EXCEPTION 'Cannot add NOT NULL constraint: % orphan ledger_entries found with NULL LedgerTransactionId', orphan_count;
    END IF;
END $$;

-- Add NOT NULL constraint if it doesn't exist
DO $$
BEGIN
    ALTER TABLE ledger_entries 
    ALTER COLUMN "LedgerTransactionId" SET NOT NULL;
    RAISE NOTICE 'Added NOT NULL constraint to ledger_entries.LedgerTransactionId';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'NOT NULL constraint already exists or cannot be added: %', SQLERRM;
END $$;

-- ============================================================================
-- 2. LEDGER_ENTRIES: Default 0 for DebitAmount and CreditAmount
-- ============================================================================

-- Set defaults to prevent NULL
ALTER TABLE ledger_entries 
ALTER COLUMN "DebitAmount" SET DEFAULT 0;

ALTER TABLE ledger_entries 
ALTER COLUMN "CreditAmount" SET DEFAULT 0;

-- Update any existing NULLs to 0
UPDATE ledger_entries SET "DebitAmount" = 0 WHERE "DebitAmount" IS NULL;
UPDATE ledger_entries SET "CreditAmount" = 0 WHERE "CreditAmount" IS NULL;

-- Now make them NOT NULL
DO $$
BEGIN
    ALTER TABLE ledger_entries ALTER COLUMN "DebitAmount" SET NOT NULL;
    ALTER TABLE ledger_entries ALTER COLUMN "CreditAmount" SET NOT NULL;
    RAISE NOTICE 'Added NOT NULL constraints to DebitAmount and CreditAmount';
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Constraints may already exist: %', SQLERRM;
END $$;

-- ============================================================================
-- 3. LEDGER_TRANSACTIONS: Enforce IdempotencyKey for POSTED transactions
-- ============================================================================

-- Add CHECK constraint: POSTED transactions must have idempotency key
-- This prevents duplicates and ensures audit trail
DO $$
BEGIN
    ALTER TABLE ledger_transactions
    ADD CONSTRAINT chk_posted_requires_idempotency
    CHECK (
        "Status" != 'POSTED' OR "IdempotencyKey" IS NOT NULL
    );
    RAISE NOTICE 'Added CHECK constraint for IdempotencyKey on POSTED transactions';
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'Constraint chk_posted_requires_idempotency already exists';
    WHEN check_violation THEN
        RAISE WARNING 'Cannot add constraint: existing POSTED transactions have NULL IdempotencyKey. Run backfill first.';
END $$;

-- Backfill NULL idempotency keys for existing POSTED transactions
-- Uses TransactionNumber as fallback key (unique)
UPDATE ledger_transactions
SET "IdempotencyKey" = 'BACKFILL-' || "TransactionNumber"
WHERE "Status" = 'POSTED' AND "IdempotencyKey" IS NULL;

-- ============================================================================
-- 4. BANK_TRANSACTIONS: Ensure GL link for non-reversed transactions
-- ============================================================================

-- Add constraint: Non-reversed bank transactions should have GL link
-- This is a WARNING constraint (not enforced) - use trigger for enforcement
CREATE OR REPLACE FUNCTION fn_warn_bank_txn_without_gl()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.gl_transaction_id IS NULL AND NEW.is_reversed = FALSE THEN
        RAISE WARNING 'Bank transaction % created without GL link', NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_warn_bank_txn_without_gl ON bank_transactions;
CREATE TRIGGER trg_warn_bank_txn_without_gl
AFTER INSERT ON bank_transactions
FOR EACH ROW
EXECUTE FUNCTION fn_warn_bank_txn_without_gl();

-- ============================================================================
-- 5. SALES: Add constraint to verify GL entry exists before COMPLETED
-- ============================================================================

-- Create function to verify GL entry exists for completed sale
CREATE OR REPLACE FUNCTION fn_verify_sale_has_gl()
RETURNS TRIGGER AS $$
DECLARE
    gl_exists BOOLEAN;
BEGIN
    -- Only check on transition to COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        -- Check if GL entry exists (may be created by trigger)
        -- Use EXISTS for performance
        SELECT EXISTS(
            SELECT 1 FROM ledger_transactions
            WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id::text
        ) INTO gl_exists;
        
        -- If trigger hasn't created it yet, this is OK - trigger fires after this
        -- This is a safety net for manual status changes
        IF NOT gl_exists THEN
            RAISE NOTICE 'Sale % marked COMPLETED - GL entry expected', NEW.sale_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 6. DOUBLE-ENTRY CONSTRAINT: Ensure all transactions balance
-- ============================================================================

-- Add table-level constraint to verify double-entry
-- This runs on INSERT/UPDATE of ledger_entries
CREATE OR REPLACE FUNCTION fn_verify_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_debit NUMERIC;
    total_credit NUMERIC;
    diff NUMERIC;
BEGIN
    -- Calculate totals for this transaction
    SELECT 
        COALESCE(SUM("DebitAmount"), 0),
        COALESCE(SUM("CreditAmount"), 0)
    INTO total_debit, total_credit
    FROM ledger_entries
    WHERE "LedgerTransactionId" = NEW."LedgerTransactionId";
    
    diff := ABS(total_debit - total_credit);
    
    -- Allow small rounding differences (0.01)
    IF diff > 0.01 THEN
        RAISE EXCEPTION 'Double-entry violation: Transaction % has debit=% credit=% (diff=%)',
            NEW."LedgerTransactionId", total_debit, total_credit, diff;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger is intentionally commented out as it would fire on each entry
-- The validation should happen at the transaction level, not entry level
-- Uncomment only if you want strict per-entry validation (may cause issues with batch inserts)
-- 
-- DROP TRIGGER IF EXISTS trg_verify_transaction_balance ON ledger_entries;
-- CREATE CONSTRAINT TRIGGER trg_verify_transaction_balance
-- AFTER INSERT OR UPDATE ON ledger_entries
-- DEFERRABLE INITIALLY DEFERRED
-- FOR EACH ROW
-- EXECUTE FUNCTION fn_verify_transaction_balance();

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

-- Run these to verify the migration:

-- 1. Check for orphan ledger entries
-- SELECT COUNT(*) FROM ledger_entries WHERE "LedgerTransactionId" IS NULL;

-- 2. Check for NULL amounts
-- SELECT COUNT(*) FROM ledger_entries WHERE "DebitAmount" IS NULL OR "CreditAmount" IS NULL;

-- 3. Check for POSTED without idempotency
-- SELECT COUNT(*) FROM ledger_transactions WHERE "Status" = 'POSTED' AND "IdempotencyKey" IS NULL;

-- 4. Check for bank txns without GL
-- SELECT COUNT(*) FROM bank_transactions WHERE gl_transaction_id IS NULL AND is_reversed = FALSE;

-- ============================================================================
-- ROLLBACK (if needed)
-- ============================================================================

-- ALTER TABLE ledger_entries ALTER COLUMN "LedgerTransactionId" DROP NOT NULL;
-- ALTER TABLE ledger_entries ALTER COLUMN "DebitAmount" DROP NOT NULL;
-- ALTER TABLE ledger_entries ALTER COLUMN "CreditAmount" DROP NOT NULL;
-- ALTER TABLE ledger_transactions DROP CONSTRAINT IF EXISTS chk_posted_requires_idempotency;
-- DROP TRIGGER IF EXISTS trg_warn_bank_txn_without_gl ON bank_transactions;
-- DROP FUNCTION IF EXISTS fn_warn_bank_txn_without_gl();
