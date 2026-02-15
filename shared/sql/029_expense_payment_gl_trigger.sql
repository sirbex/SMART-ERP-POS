-- Migration: Add GL posting for expense payment phase
-- When an approved expense is marked as paid (payment_status changes to PAID),
-- post a journal entry to clear AP and credit the cash/bank account

-- Update the expense GL trigger to handle both approval and payment phases
CREATE OR REPLACE FUNCTION fn_post_expense_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_expense_account_id UUID;
    v_cash_account_id UUID;
    v_ap_account_id UUID;
    v_credit_account_id UUID;
BEGIN
    -- Get default accounts
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';

    -- ================================================================
    -- PHASE 1: APPROVAL - Post expense recognition
    -- When status changes to APPROVED, recognize the expense
    -- ================================================================
    IF NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status != 'APPROVED') THEN

        -- Prevent duplicate postings
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'EXPENSE' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Expense % already posted to ledger - skipping approval posting', NEW.expense_number;
        ELSE
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

            -- Determine credit account based on payment status at approval time
            IF NEW.payment_status = 'PAID' THEN
                -- Already paid at creation - credit cash/bank directly
                IF NEW.payment_account_id IS NOT NULL THEN
                    v_credit_account_id := NEW.payment_account_id;
                ELSE
                    v_credit_account_id := v_cash_account_id;
                END IF;
            ELSE
                -- Unpaid at approval - credit Accounts Payable
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
                    'Expense recognition: ' || NEW.expense_number,
                    'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                RAISE NOTICE 'Posted expense % approval to ledger (Debit: %, Credit: %)', 
                    NEW.expense_number, v_expense_account_id, v_credit_account_id;
            END IF;
        END IF;
    END IF;

    -- ================================================================
    -- PHASE 2: PAYMENT - Clear AP when expense is marked as paid
    -- When payment_status changes to PAID on an already-approved expense
    -- Post: DR Accounts Payable, CR Cash/Bank
    -- ================================================================
    IF NEW.status = 'APPROVED' AND OLD.status = 'APPROVED' 
       AND NEW.payment_status = 'PAID' 
       AND (OLD.payment_status IS NULL OR OLD.payment_status != 'PAID') THEN

        -- Prevent duplicate payment postings
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'EXPENSE_PAYMENT' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Expense payment % already posted to ledger - skipping', NEW.expense_number;
        ELSE
            -- Determine which cash/bank account to credit
            IF NEW.payment_account_id IS NOT NULL THEN
                v_credit_account_id := NEW.payment_account_id;
            ELSE
                v_credit_account_id := v_cash_account_id;
            END IF;

            IF COALESCE(NEW.amount, 0) > 0 THEN
                v_transaction_number := generate_ledger_transaction_number();
                v_transaction_id := gen_random_uuid();

                -- Create ledger transaction for payment
                INSERT INTO ledger_transactions (
                    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                    "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                    "Status", "CreatedAt", "UpdatedAt", "IsReversed"
                ) VALUES (
                    v_transaction_id,
                    v_transaction_number,
                    CURRENT_DATE,
                    'EXPENSE_PAYMENT',
                    NEW.id,
                    NEW.expense_number,
                    'Payment for expense: ' || COALESCE(NEW.title, NEW.expense_number),
                    COALESCE(NEW.amount, 0),
                    COALESCE(NEW.amount, 0),
                    'POSTED',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    FALSE
                );

                -- DEBIT: Accounts Payable (clear the liability)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_ap_account_id,
                    COALESCE(NEW.amount, 0), 0,
                    'Clear AP for expense: ' || NEW.expense_number,
                    'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                -- CREDIT: Cash/Bank (reduce cash)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                    0, COALESCE(NEW.amount, 0),
                    'Payment for expense: ' || NEW.expense_number,
                    'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                RAISE NOTICE 'Posted expense payment % to ledger (Debit AP: %, Credit Cash: %)', 
                    NEW.expense_number, v_ap_account_id, v_credit_account_id;
            END IF;
        END IF;
    END IF;

    -- ================================================================
    -- PHASE 2 ALT: When status changes to PAID (via markExpensePaid)
    -- This handles the legacy flow where status goes APPROVED -> PAID
    -- ================================================================
    IF NEW.status = 'PAID' AND OLD.status = 'APPROVED' THEN
        -- Update payment_status to PAID if not already
        -- (This is handled by the service, but we check here as backup)
        
        -- Check if payment GL entry already exists
        IF NOT EXISTS (SELECT 1 FROM ledger_transactions 
                       WHERE "ReferenceType" = 'EXPENSE_PAYMENT' AND "ReferenceId" = NEW.id) THEN
            
            -- Determine which cash/bank account to credit
            IF NEW.payment_account_id IS NOT NULL THEN
                v_credit_account_id := NEW.payment_account_id;
            ELSE
                v_credit_account_id := v_cash_account_id;
            END IF;

            IF COALESCE(NEW.amount, 0) > 0 THEN
                v_transaction_number := generate_ledger_transaction_number();
                v_transaction_id := gen_random_uuid();

                -- Create ledger transaction for payment
                INSERT INTO ledger_transactions (
                    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                    "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                    "Status", "CreatedAt", "UpdatedAt", "IsReversed"
                ) VALUES (
                    v_transaction_id,
                    v_transaction_number,
                    CURRENT_DATE,
                    'EXPENSE_PAYMENT',
                    NEW.id,
                    NEW.expense_number,
                    'Payment for expense: ' || COALESCE(NEW.title, NEW.expense_number),
                    COALESCE(NEW.amount, 0),
                    COALESCE(NEW.amount, 0),
                    'POSTED',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    FALSE
                );

                -- DEBIT: Accounts Payable (clear the liability)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_ap_account_id,
                    COALESCE(NEW.amount, 0), 0,
                    'Clear AP for expense: ' || NEW.expense_number,
                    'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                -- CREDIT: Cash/Bank (reduce cash)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                    0, COALESCE(NEW.amount, 0),
                    'Payment for expense: ' || NEW.expense_number,
                    'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                RAISE NOTICE 'Posted expense payment % to ledger via status change (Debit AP: %, Credit Cash: %)', 
                    NEW.expense_number, v_ap_account_id, v_credit_account_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Verify trigger is in place
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgname = 'trg_post_expense_to_ledger' 
        AND tgrelid = 'expenses'::regclass
    ) THEN
        CREATE TRIGGER trg_post_expense_to_ledger
        AFTER INSERT OR UPDATE ON expenses
        FOR EACH ROW
        EXECUTE FUNCTION fn_post_expense_to_ledger();
    END IF;
END $$;

-- Success message
SELECT 'Expense GL trigger updated to handle both approval and payment phases' AS status;
