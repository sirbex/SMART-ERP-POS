-- ============================================================================
-- 027_fix_expense_gl_trigger.sql
-- ============================================================================
-- Purpose: Fix expense GL trigger and ensure all required columns exist
-- - Adds missing payment_status column to expenses
-- - Adds account_id column to expense_categories for GL mapping
-- - Fixes EntryDate default on ledger_entries (was -infinity)
-- - Fixes fn_post_expense_to_ledger to use account_id instead of ledger_account_code
-- ============================================================================

-- 1. Add payment_status column to expenses if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'expenses' AND column_name = 'payment_status') THEN
        ALTER TABLE expenses ADD COLUMN payment_status VARCHAR(20) DEFAULT 'UNPAID' 
            CHECK (payment_status IN ('UNPAID', 'PAID', 'PARTIAL'));
        RAISE NOTICE 'Added payment_status column to expenses';
    END IF;
END $$;

-- 2. Add account_id column to expense_categories if missing (for GL account mapping)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'expense_categories' AND column_name = 'account_id') THEN
        ALTER TABLE expense_categories ADD COLUMN account_id UUID REFERENCES accounts("Id");
        RAISE NOTICE 'Added account_id column to expense_categories';
    END IF;
END $$;

-- 3. Fix ledger_entries EntryDate default (was -infinity which breaks triggers)
DO $$
BEGIN
    -- Only update if currently set to -infinity
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ledger_entries' 
        AND column_name = 'EntryDate'
        AND column_default LIKE '%infinity%'
    ) THEN
        ALTER TABLE ledger_entries ALTER COLUMN "EntryDate" SET DEFAULT CURRENT_TIMESTAMP;
        RAISE NOTICE 'Fixed EntryDate default from -infinity to CURRENT_TIMESTAMP';
    END IF;
    
    -- Fix any existing rows with -infinity values
    UPDATE ledger_entries SET "EntryDate" = "CreatedAt" 
    WHERE "EntryDate" = '-infinity'::timestamptz;
END $$;

-- Fix the expense GL trigger
CREATE OR REPLACE FUNCTION fn_post_expense_to_ledger()
RETURNS trigger AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_expense_account_id UUID;
    v_cash_account_id UUID;
    v_ap_account_id UUID;
    v_credit_account_id UUID;
BEGIN
    -- Only trigger on status change to APPROVED
    IF NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status != 'APPROVED') THEN

        -- Prevent duplicate postings
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'EXPENSE' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Expense % already posted to ledger - skipping', NEW.expense_number;
            RETURN NEW;
        END IF;

        -- Get default expense account (General Expense)
        SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';

        -- Try to map expense category to specific account using account_id
        IF NEW.category_id IS NOT NULL THEN
            SELECT ec.account_id INTO v_expense_account_id
            FROM expense_categories ec
            WHERE ec.id = NEW.category_id AND ec.account_id IS NOT NULL;
        END IF;

        -- Fallback to default if no account found
        IF v_expense_account_id IS NULL THEN
            SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
        END IF;

        -- Determine credit account based on payment status
        IF NEW.payment_status = 'PAID' THEN
            v_credit_account_id := v_cash_account_id;
        ELSE
            v_credit_account_id := v_ap_account_id;
        END IF;

        IF COALESCE(NEW.amount, 0) > 0 THEN
            v_transaction_number := generate_ledger_transaction_number();
            v_transaction_id := gen_random_uuid();

            -- Create ledger transaction
            INSERT INTO ledger_transactions (
                "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                "Status", "CreatedAt", "UpdatedAt", "IsReversed"
            ) VALUES (
                v_transaction_id,
                v_transaction_number,
                COALESCE(NEW.expense_date, CURRENT_DATE),
                'EXPENSE',
                NEW.id,
                NEW.expense_number,
                'Expense: ' || COALESCE(NEW.description, NEW.expense_number),
                COALESCE(NEW.amount, 0),
                COALESCE(NEW.amount, 0),
                'POSTED',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                FALSE
            );

            -- DEBIT: Expense account
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
            ) VALUES (
                gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_expense_account_id,
                COALESCE(NEW.amount, 0), 0,
                'Expense: ' || COALESCE(NEW.description, NEW.expense_number),
                'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
            );

            -- CREDIT: Cash or AP
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
            ) VALUES (
                gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                0, COALESCE(NEW.amount, 0),
                'Payment for expense: ' || NEW.expense_number,
                'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
            );

            RAISE NOTICE 'Posted expense % to ledger', NEW.expense_number;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify trigger is connected
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_post_expense_to_ledger') THEN
        CREATE TRIGGER trg_post_expense_to_ledger
            AFTER INSERT OR UPDATE ON expenses
            FOR EACH ROW EXECUTE FUNCTION fn_post_expense_to_ledger();
    END IF;
END $$;

SELECT 'Expense GL trigger fixed successfully' as status;
