-- Expense GL Account Integration
-- Links expense categories to chart of accounts for proper GL posting
-- Date: 2025-12-28

-- =============================================================================
-- Step 1: Add account_id column to expense_categories
-- =============================================================================

ALTER TABLE expense_categories 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts("Id");

-- =============================================================================
-- Step 2: Update existing categories with their corresponding GL accounts
-- =============================================================================

-- Map expense categories to GL account codes
UPDATE expense_categories ec
SET account_id = a."Id"
FROM accounts a
WHERE 
    (ec.code = 'OFFICE' AND a."AccountCode" = '6400') OR
    (ec.code = 'TRAVEL' AND a."AccountCode" = '6800') OR
    (ec.code = 'MEALS' AND a."AccountCode" = '6800') OR
    (ec.code = 'FUEL' AND a."AccountCode" = '6800') OR
    (ec.code = 'UTILITIES' AND a."AccountCode" = '6200') OR
    (ec.code = 'SALARIES' AND a."AccountCode" = '6000') OR
    (ec.code = 'RENT' AND a."AccountCode" = '6100') OR
    (ec.code = 'MARKETING' AND a."AccountCode" = '6300') OR
    (ec.code = 'INSURANCE' AND a."AccountCode" = '6600') OR
    (ec.code = 'PROFESSIONAL' AND a."AccountCode" = '6700');

-- Set default account (General Expense 6900) for any unmapped categories
UPDATE expense_categories ec
SET account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '6900' LIMIT 1)
WHERE ec.account_id IS NULL;

-- =============================================================================
-- Step 3: Add account_id column to expenses table for direct GL linking
-- =============================================================================

ALTER TABLE expenses 
ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts("Id");

-- Update existing expenses to link to the correct account via category
UPDATE expenses e
SET account_id = ec.account_id
FROM expense_categories ec
WHERE UPPER(e.category) = UPPER(ec.code) OR UPPER(e.category) = UPPER(ec.name);

-- Set default account for expenses without category match
UPDATE expenses e
SET account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '6900' LIMIT 1)
WHERE e.account_id IS NULL;

-- =============================================================================
-- Step 4: Create view for expense GL reconciliation
-- =============================================================================

CREATE OR REPLACE VIEW v_expense_gl_summary AS
SELECT 
    a."AccountCode",
    a."AccountName",
    COUNT(e.id) AS expense_count,
    COALESCE(SUM(e.amount), 0) AS total_expense_amount,
    COALESCE(
        (SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
         FROM ledger_entries le
         JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
         WHERE le."AccountId" = a."Id" AND lt."Status" = 'POSTED'),
        0
    ) AS gl_balance,
    CASE 
        WHEN COALESCE(SUM(CASE WHEN e.status = 'PAID' THEN e.amount ELSE 0 END), 0) = 
             COALESCE(
                 (SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
                  FROM ledger_entries le
                  JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
                  WHERE le."AccountId" = a."Id" AND lt."Status" = 'POSTED'),
                 0
             )
        THEN 'MATCHED'
        ELSE 'DISCREPANCY'
    END AS reconciliation_status
FROM accounts a
LEFT JOIN expenses e ON e.account_id = a."Id"
WHERE a."AccountType" = 'EXPENSE'
GROUP BY a."Id", a."AccountCode", a."AccountName"
ORDER BY a."AccountCode";

-- =============================================================================
-- Step 5: Create function to post a single expense to GL
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_post_expense_to_gl(
    p_expense_id UUID,
    p_payment_account_code VARCHAR DEFAULT '1010' -- Default to Cash
) RETURNS JSONB AS $$
DECLARE
    v_expense RECORD;
    v_expense_account_id UUID;
    v_payment_account_id UUID;
    v_transaction_id UUID;
    v_result JSONB;
BEGIN
    -- Get expense details
    SELECT e.*, a."AccountCode" AS expense_account_code, a."AccountName" AS expense_account_name
    INTO v_expense
    FROM expenses e
    LEFT JOIN accounts a ON e.account_id = a."Id"
    WHERE e.id = p_expense_id;

    IF v_expense IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Expense not found');
    END IF;

    IF v_expense.status != 'PAID' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only PAID expenses can be posted to GL');
    END IF;

    -- Get account IDs
    v_expense_account_id := v_expense.account_id;
    IF v_expense_account_id IS NULL THEN
        SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
    END IF;

    SELECT "Id" INTO v_payment_account_id FROM accounts WHERE "AccountCode" = p_payment_account_code;
    IF v_payment_account_id IS NULL THEN
        SELECT "Id" INTO v_payment_account_id FROM accounts WHERE "AccountCode" = '1010';
    END IF;

    -- Check for duplicate posting
    IF EXISTS (
        SELECT 1 FROM ledger_transactions 
        WHERE "ReferenceType" = 'EXPENSE' 
        AND "ReferenceId" = p_expense_id::TEXT
        AND "Status" = 'POSTED'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Expense already posted to GL');
    END IF;

    -- Create ledger transaction
    INSERT INTO ledger_transactions (
        "TransactionDate",
        "Description",
        "ReferenceType",
        "ReferenceId",
        "ReferenceNumber",
        "Status",
        "CreatedBy"
    ) VALUES (
        v_expense.expense_date,
        'Expense: ' || v_expense.title,
        'EXPENSE',
        p_expense_id::TEXT,
        v_expense.expense_number,
        'POSTED',
        '00000000-0000-0000-0000-000000000000'
    ) RETURNING "Id" INTO v_transaction_id;

    -- Create debit entry (expense account)
    INSERT INTO ledger_entries (
        "TransactionId",
        "AccountId",
        "Description",
        "DebitAmount",
        "CreditAmount"
    ) VALUES (
        v_transaction_id,
        v_expense_account_id,
        v_expense.category || ': ' || v_expense.title,
        v_expense.amount,
        0
    );

    -- Create credit entry (payment account - usually cash)
    INSERT INTO ledger_entries (
        "TransactionId",
        "AccountId",
        "Description",
        "DebitAmount",
        "CreditAmount"
    ) VALUES (
        v_transaction_id,
        v_payment_account_id,
        'Payment for ' || v_expense.expense_number,
        0,
        v_expense.amount
    );

    RETURN jsonb_build_object(
        'success', true,
        'transactionId', v_transaction_id,
        'expenseNumber', v_expense.expense_number,
        'amount', v_expense.amount,
        'debitAccount', v_expense.expense_account_code || ' - ' || v_expense.expense_account_name,
        'creditAccount', p_payment_account_code || ' - Cash'
    );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Step 6: Backfill any PAID expenses that haven't been posted to GL
-- =============================================================================

DO $$
DECLARE
    v_expense RECORD;
    v_result JSONB;
    v_count INT := 0;
BEGIN
    FOR v_expense IN 
        SELECT e.id 
        FROM expenses e
        WHERE e.status = 'PAID'
        AND NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt
            WHERE lt."ReferenceType" = 'EXPENSE'
            AND lt."ReferenceId" = e.id::TEXT
        )
    LOOP
        v_result := fn_post_expense_to_gl(v_expense.id);
        IF (v_result->>'success')::boolean THEN
            v_count := v_count + 1;
            RAISE NOTICE 'Posted expense % to GL', v_result->>'expenseNumber';
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Backfilled % PAID expenses to GL', v_count;
END $$;

-- =============================================================================
-- Step 7: Verify the setup
-- =============================================================================

SELECT '=== Expense Categories with GL Accounts ===' AS section;
SELECT ec.name, ec.code, a."AccountCode", a."AccountName"
FROM expense_categories ec
LEFT JOIN accounts a ON ec.account_id = a."Id"
ORDER BY a."AccountCode";

SELECT '=== Expenses with GL Mapping ===' AS section;
SELECT e.expense_number, e.title, e.amount, e.status, e.category, a."AccountCode", a."AccountName"
FROM expenses e
LEFT JOIN accounts a ON e.account_id = a."Id"
ORDER BY e.created_at DESC LIMIT 10;

SELECT '=== Expense GL Transactions ===' AS section;
SELECT lt."ReferenceNumber", lt."Description", lt."TransactionDate", lt."Status"
FROM ledger_transactions lt
WHERE lt."ReferenceType" = 'EXPENSE'
ORDER BY lt."TransactionDate" DESC LIMIT 10;

SELECT '=== Expense Account Balances ===' AS section;
SELECT * FROM v_expense_gl_summary;
