-- ============================================================================
-- 028_expense_payment_account.sql
-- ============================================================================
-- Purpose: Add payment_account_id column to expenses table
-- This allows users to specify which cash/bank account was used to pay an expense
-- Follows proper accounting: Expense (Dr) = Amount, Payment Account (Cr) = Amount
-- ============================================================================

-- 1. Add payment_account_id column to expenses if missing
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'expenses' AND column_name = 'payment_account_id') THEN
        ALTER TABLE expenses ADD COLUMN payment_account_id UUID REFERENCES accounts("Id");
        RAISE NOTICE 'Added payment_account_id column to expenses';
        
        -- Add comment explaining the field
        COMMENT ON COLUMN expenses.payment_account_id IS 
            'The cash/bank account used to pay this expense (CREDIT side of journal entry). Required when payment_status = PAID.';
    END IF;
END $$;

-- 2. Update the expense GL trigger to use payment_account_id when available
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

        -- Get default accounts
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';

        -- Get expense account (DEBIT side) from expense category mapping
        IF NEW.category_id IS NOT NULL THEN
            SELECT ec.account_id INTO v_expense_account_id
            FROM expense_categories ec
            WHERE ec.id = NEW.category_id AND ec.account_id IS NOT NULL;
        END IF;

        -- Fallback to default expense account if no category mapping
        IF v_expense_account_id IS NULL THEN
            SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
        END IF;

        -- Determine credit account (CREDIT side) based on payment status and user selection
        IF NEW.payment_status = 'PAID' THEN
            -- Use user-selected payment account if available, otherwise default to Cash
            IF NEW.payment_account_id IS NOT NULL THEN
                v_credit_account_id := NEW.payment_account_id;
            ELSE
                v_credit_account_id := v_cash_account_id;
            END IF;
        ELSE
            -- Unpaid expenses go to Accounts Payable
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
                'Expense: ' || COALESCE(NEW.title, NEW.expense_number),
                COALESCE(NEW.amount, 0),
                COALESCE(NEW.amount, 0),
                'POSTED',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                FALSE
            );

            -- DEBIT: Expense account (increases expense)
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
            ) VALUES (
                gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_expense_account_id,
                COALESCE(NEW.amount, 0), 0,
                'Expense: ' || COALESCE(NEW.title, NEW.expense_number),
                'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
            );

            -- CREDIT: Cash/Bank (if paid) or AP (if unpaid)
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
            ) VALUES (
                gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                0, COALESCE(NEW.amount, 0),
                'Payment for expense: ' || NEW.expense_number,
                'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
            );

            RAISE NOTICE 'Posted expense % to ledger (Debit: %, Credit: %)', 
                NEW.expense_number, v_expense_account_id, v_credit_account_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Ensure trigger exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_post_expense_to_ledger') THEN
        CREATE TRIGGER trg_post_expense_to_ledger
            AFTER INSERT OR UPDATE ON expenses
            FOR EACH ROW EXECUTE FUNCTION fn_post_expense_to_ledger();
        RAISE NOTICE 'Created expense GL trigger';
    END IF;
END $$;

SELECT 'Expense payment account integration complete' as status;
