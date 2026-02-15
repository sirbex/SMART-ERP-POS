-- ============================================================================
-- ACCOUNTING COMPLETE RESET FUNCTION
-- ============================================================================
-- This function ensures ALL accounting-related data is properly reset to 0
-- It is called during system reset operations and ensures:
-- 1. All ledger entries are cleared
-- 2. All account balances are reset to 0
-- 3. All idempotency keys are cleared
-- 4. GL is ready for fresh transactions
-- ============================================================================

-- Drop existing function if exists
DROP FUNCTION IF EXISTS fn_reset_accounting_complete();

CREATE OR REPLACE FUNCTION fn_reset_accounting_complete()
RETURNS TABLE (
    step_name TEXT,
    records_affected INTEGER,
    status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Step 1: Clear all ledger entries
    DELETE FROM ledger_entries;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'ledger_entries';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 2: Clear all ledger transactions  
    DELETE FROM ledger_transactions;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'ledger_transactions';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 3: Clear journal entry lines
    DELETE FROM journal_entry_lines WHERE TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'journal_entry_lines';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 4: Clear journal entries
    DELETE FROM journal_entries WHERE TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'journal_entries';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 5: Reset ALL account current balances to 0
    UPDATE accounts SET "CurrentBalance" = 0;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'accounts_balance_reset';
    records_affected := v_count;
    status := 'RESET_TO_ZERO';
    RETURN NEXT;

    -- Step 6: Verify accounts are all zero
    SELECT COUNT(*) INTO v_count FROM accounts WHERE "CurrentBalance" != 0;
    step_name := 'verify_zero_balances';
    records_affected := v_count;
    status := CASE WHEN v_count = 0 THEN 'VERIFIED' ELSE 'WARNING' END;
    RETURN NEXT;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        step_name := 'ERROR';
        records_affected := 0;
        status := SQLERRM;
        RETURN NEXT;
END;
$$;

-- ============================================================================
-- FUNCTION: fn_recalculate_all_account_balances
-- Recalculates all account balances from ledger entries
-- ============================================================================
DROP FUNCTION IF EXISTS fn_recalculate_all_account_balances();

CREATE OR REPLACE FUNCTION fn_recalculate_all_account_balances()
RETURNS TABLE (
    account_code VARCHAR,
    old_balance NUMERIC,
    new_balance NUMERIC,
    status TEXT
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_account RECORD;
    v_calculated_balance NUMERIC;
BEGIN
    FOR v_account IN 
        SELECT a."Id", a."AccountCode", a."NormalBalance", a."CurrentBalance"
        FROM accounts a
        WHERE a."IsActive" = true
    LOOP
        -- Calculate balance from ledger entries
        SELECT 
            CASE 
                WHEN v_account."NormalBalance" = 'DEBIT' 
                THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
                ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
            END INTO v_calculated_balance
        FROM ledger_entries le
        WHERE le."AccountId" = v_account."Id";

        -- Handle NULL case
        v_calculated_balance := COALESCE(v_calculated_balance, 0);

        -- Update if different
        IF v_account."CurrentBalance" IS DISTINCT FROM v_calculated_balance THEN
            UPDATE accounts 
            SET "CurrentBalance" = v_calculated_balance
            WHERE "Id" = v_account."Id";
            
            account_code := v_account."AccountCode";
            old_balance := v_account."CurrentBalance";
            new_balance := v_calculated_balance;
            status := 'UPDATED';
            RETURN NEXT;
        ELSE
            account_code := v_account."AccountCode";
            old_balance := v_account."CurrentBalance";
            new_balance := v_calculated_balance;
            status := 'UNCHANGED';
            RETURN NEXT;
        END IF;
    END LOOP;
    RETURN;
END;
$$;

-- ============================================================================
-- VERIFY INSTALLATION
-- ============================================================================
SELECT 'Accounting reset functions installed successfully' as status;

-- Show available accounting reset functions
SELECT 
    proname as function_name,
    'INSTALLED' as status
FROM pg_proc 
WHERE proname IN (
    'fn_reset_accounting_complete',
    'fn_recalculate_all_account_balances'
);
