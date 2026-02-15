-- ============================================================================
-- ACCOUNT BALANCE SYNCHRONIZATION
-- ============================================================================
-- Purpose: Ensures accounts.CurrentBalance stays in sync with ledger_entries
-- Date: December 29, 2025
-- 
-- ISSUE: GL posting triggers create ledger_entries but don't update 
--        accounts.CurrentBalance, causing reconciliation mismatches.
--
-- SOLUTION: 
--   1. Trigger to auto-update CurrentBalance on ledger_entry changes
--   2. One-time recalculation to fix existing mismatches
-- ============================================================================

-- ============================================================================
-- PART 1: CREATE THE SYNC TRIGGER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_sync_account_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_account_type VARCHAR(50);
    v_new_balance NUMERIC(15,2);
BEGIN
    -- Determine which account to update based on operation type
    IF TG_OP = 'DELETE' THEN
        -- Recalculate balance for the deleted entry's account
        SELECT a."AccountType" INTO v_account_type
        FROM accounts a
        WHERE a."Id" = OLD."AccountId";
        
        -- Calculate new balance based on account type
        -- ASSET/EXPENSE: Debits increase, Credits decrease
        -- LIABILITY/EQUITY/REVENUE: Credits increase, Debits decrease
        SELECT 
            CASE 
                WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = OLD."AccountId";
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE(v_new_balance, 0),
            "UpdatedAt" = NOW()
        WHERE "Id" = OLD."AccountId";
        
        RETURN OLD;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- If AccountId changed, update both old and new accounts
        IF OLD."AccountId" != NEW."AccountId" THEN
            -- Update old account
            SELECT a."AccountType" INTO v_account_type
            FROM accounts a
            WHERE a."Id" = OLD."AccountId";
            
            SELECT 
                CASE 
                    WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                    THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                    ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
                END INTO v_new_balance
            FROM ledger_entries
            WHERE "AccountId" = OLD."AccountId";
            
            UPDATE accounts 
            SET "CurrentBalance" = COALESCE(v_new_balance, 0),
                "UpdatedAt" = NOW()
            WHERE "Id" = OLD."AccountId";
        END IF;
        
        -- Update new/current account
        SELECT a."AccountType" INTO v_account_type
        FROM accounts a
        WHERE a."Id" = NEW."AccountId";
        
        SELECT 
            CASE 
                WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = NEW."AccountId";
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE(v_new_balance, 0),
            "UpdatedAt" = NOW()
        WHERE "Id" = NEW."AccountId";
        
        RETURN NEW;
        
    ELSE -- INSERT
        -- Get account type for the new entry's account
        SELECT a."AccountType" INTO v_account_type
        FROM accounts a
        WHERE a."Id" = NEW."AccountId";
        
        -- Calculate new balance including this entry
        SELECT 
            CASE 
                WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = NEW."AccountId";
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE(v_new_balance, 0),
            "UpdatedAt" = NOW()
        WHERE "Id" = NEW."AccountId";
        
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_sync_account_balance ON ledger_entries;

-- Create the trigger
CREATE TRIGGER trg_sync_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_sync_account_balance();

-- ============================================================================
-- PART 2: ONE-TIME BALANCE RECALCULATION
-- ============================================================================
-- This fixes all existing mismatches by recalculating from ledger_entries

DO $$
DECLARE
    v_account RECORD;
    v_new_balance NUMERIC(15,2);
    v_updated_count INT := 0;
BEGIN
    RAISE NOTICE 'Starting account balance recalculation...';
    
    FOR v_account IN 
        SELECT "Id", "AccountCode", "AccountName", "AccountType", "CurrentBalance"
        FROM accounts
    LOOP
        -- Calculate correct balance based on account type
        SELECT 
            CASE 
                WHEN v_account."AccountType" IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = v_account."Id";
        
        v_new_balance := COALESCE(v_new_balance, 0);
        
        -- Only update if different
        IF v_account."CurrentBalance" != v_new_balance THEN
            UPDATE accounts 
            SET "CurrentBalance" = v_new_balance,
                "UpdatedAt" = NOW()
            WHERE "Id" = v_account."Id";
            
            RAISE NOTICE 'Fixed %: % -> %', 
                v_account."AccountCode", 
                v_account."CurrentBalance", 
                v_new_balance;
            
            v_updated_count := v_updated_count + 1;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Recalculation complete. Updated % accounts.', v_updated_count;
END $$;

-- ============================================================================
-- PART 3: VERIFICATION QUERY
-- ============================================================================
-- Run this to verify all accounts are now in sync

SELECT 
    a."AccountCode",
    a."AccountName",
    a."AccountType",
    a."CurrentBalance"::numeric(15,2) as stored_balance,
    CASE 
        WHEN a."AccountType" IN ('ASSET', 'EXPENSE') 
        THEN (COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0))::numeric(15,2)
        ELSE (COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0))::numeric(15,2)
    END as calculated_balance,
    CASE 
        WHEN a."CurrentBalance" = 
            CASE 
                WHEN a."AccountType" IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0)
                ELSE COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0)
            END
        THEN '✓ OK'
        ELSE '✗ MISMATCH'
    END as status
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType", a."CurrentBalance"
ORDER BY a."AccountCode";
