-- ============================================================================
-- ACCOUNTING CORE SCHEMA ENHANCEMENTS
-- Adds columns required for audit-safe accounting operations
-- ============================================================================

-- Add IdempotencyKey to ledger_transactions for preventing duplicate entries
ALTER TABLE ledger_transactions 
ADD COLUMN IF NOT EXISTS "IdempotencyKey" VARCHAR(255) UNIQUE;

-- Add audit columns to ledger_transactions
ALTER TABLE ledger_transactions 
ADD COLUMN IF NOT EXISTS "CreatedBy" UUID;

ALTER TABLE ledger_transactions 
ADD COLUMN IF NOT EXISTS "ReversesTransactionId" UUID REFERENCES ledger_transactions("Id");

ALTER TABLE ledger_transactions 
ADD COLUMN IF NOT EXISTS "ReversedByTransactionId" UUID REFERENCES ledger_transactions("Id");

ALTER TABLE ledger_transactions 
ADD COLUMN IF NOT EXISTS "ReversedAt" TIMESTAMPTZ;

-- Add LedgerTransactionId column if it doesn't exist (some systems use TransactionId)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ledger_entries' AND column_name = 'LedgerTransactionId'
    ) THEN
        -- Check if TransactionId exists and rename it
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'ledger_entries' AND column_name = 'TransactionId'
        ) THEN
            ALTER TABLE ledger_entries RENAME COLUMN "TransactionId" TO "LedgerTransactionId";
        ELSE
            ALTER TABLE ledger_entries ADD COLUMN "LedgerTransactionId" UUID REFERENCES ledger_transactions("Id");
        END IF;
    END IF;
END $$;

-- Add EntityType and EntityId to ledger_entries for source tracking
ALTER TABLE ledger_entries 
ADD COLUMN IF NOT EXISTS "EntityType" VARCHAR(50);

ALTER TABLE ledger_entries 
ADD COLUMN IF NOT EXISTS "EntityId" UUID;

-- Ensure financial_periods has required columns
ALTER TABLE financial_periods 
ADD COLUMN IF NOT EXISTS "LockedAt" TIMESTAMPTZ;

ALTER TABLE financial_periods 
ADD COLUMN IF NOT EXISTS "LockedBy" UUID;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_idempotency 
ON ledger_transactions("IdempotencyKey");

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_status 
ON ledger_transactions("Status");

CREATE INDEX IF NOT EXISTS idx_ledger_transactions_date 
ON ledger_transactions("TransactionDate");

CREATE INDEX IF NOT EXISTS idx_ledger_entries_account 
ON ledger_entries("AccountId");

CREATE INDEX IF NOT EXISTS idx_ledger_entries_transaction 
ON ledger_entries("LedgerTransactionId");

CREATE INDEX IF NOT EXISTS idx_financial_periods_dates 
ON financial_periods("StartDate", "EndDate");

-- ============================================================================
-- IMMUTABILITY TRIGGER
-- Prevents modification of POSTED transactions
-- ============================================================================

CREATE OR REPLACE FUNCTION prevent_posted_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Only allow status changes from POSTED to REVERSED
    IF OLD."Status" = 'POSTED' AND NEW."Status" != 'REVERSED' THEN
        -- Allow updating reversal tracking columns
        IF NEW."ReversedByTransactionId" IS DISTINCT FROM OLD."ReversedByTransactionId" 
           OR NEW."ReversedAt" IS DISTINCT FROM OLD."ReversedAt"
           OR NEW."Status" = 'REVERSED' THEN
            RETURN NEW;
        END IF;
        
        RAISE EXCEPTION 'Cannot modify POSTED transaction. Use reversal instead.';
    END IF;
    
    -- Prevent any modification of REVERSED transactions
    IF OLD."Status" = 'REVERSED' THEN
        RAISE EXCEPTION 'Cannot modify REVERSED transaction.';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_posted_modification ON ledger_transactions;
CREATE TRIGGER tr_prevent_posted_modification
    BEFORE UPDATE ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION prevent_posted_modification();

-- ============================================================================
-- DOUBLE-ENTRY VALIDATION TRIGGER
-- Ensures every transaction is balanced before insert
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_transaction_balance()
RETURNS TRIGGER AS $$
DECLARE
    balance_diff NUMERIC;
BEGIN
    -- Allow small rounding differences (0.001)
    balance_diff := ABS(NEW."TotalDebitAmount" - NEW."TotalCreditAmount");
    
    IF balance_diff > 0.001 THEN
        RAISE EXCEPTION 'Double-entry violation: Debits (%) ≠ Credits (%). Difference: %',
            NEW."TotalDebitAmount", NEW."TotalCreditAmount", balance_diff;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_validate_transaction_balance ON ledger_transactions;
CREATE TRIGGER tr_validate_transaction_balance
    BEFORE INSERT ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_transaction_balance();

-- ============================================================================
-- PERIOD LOCK VALIDATION TRIGGER  
-- Prevents posting to closed/locked periods
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_period_open()
RETURNS TRIGGER AS $$
DECLARE
    period_status VARCHAR(20);
BEGIN
    -- Check if period exists and is open
    SELECT "Status" INTO period_status
    FROM financial_periods
    WHERE NEW."TransactionDate" BETWEEN "StartDate" AND "EndDate"
    LIMIT 1;
    
    -- If no period defined, allow (implicit open)
    IF period_status IS NULL THEN
        RETURN NEW;
    END IF;
    
    -- Only allow posting to OPEN periods
    IF period_status != 'OPEN' THEN
        RAISE EXCEPTION 'Cannot post to % period for date %', period_status, NEW."TransactionDate";
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_validate_period_open ON ledger_transactions;
CREATE TRIGGER tr_validate_period_open
    BEFORE INSERT ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION validate_period_open();

-- ============================================================================
-- VERIFY SETUP
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Accounting Core schema enhancements applied successfully';
    RAISE NOTICE 'Triggers installed:';
    RAISE NOTICE '  - tr_prevent_posted_modification (immutability)';
    RAISE NOTICE '  - tr_validate_transaction_balance (double-entry)';
    RAISE NOTICE '  - tr_validate_period_open (period locking)';
END $$;
