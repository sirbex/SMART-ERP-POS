-- Backfill GL entries for existing sale SALE-2025-0001
-- This sale failed to post due to LedgerTransactionId column name bug
-- Run: psql -U postgres -d pos_system -f shared/sql/backfill_sale_gl.sql

DO $$
DECLARE
    v_sale_id UUID := 'a4c16cfc-e612-401b-8b2e-3da75aefdb48';
    v_sale_number VARCHAR := 'SALE-2025-0001';
    v_sale_date DATE := '2025-12-28';
    v_total_amount NUMERIC := 130000.00;
    v_cost_amount NUMERIC := 100000.00;
    v_transaction_id UUID;
    v_next_txn_num INT;
    v_txn_number VARCHAR;
    v_cash_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_existing_count INT;
BEGIN
    -- Check if already exists (idempotency)
    SELECT COUNT(*) INTO v_existing_count 
    FROM ledger_transactions 
    WHERE "ReferenceNumber" = v_sale_number AND "Status" = 'POSTED';
    
    IF v_existing_count > 0 THEN
        RAISE NOTICE 'GL entry for % already exists, skipping...', v_sale_number;
        RETURN;
    END IF;

    -- Get account IDs
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
    SELECT "Id" INTO v_cogs_account_id FROM accounts WHERE "AccountCode" = '5000';
    SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';

    IF v_cash_account_id IS NULL OR v_revenue_account_id IS NULL OR 
       v_cogs_account_id IS NULL OR v_inventory_account_id IS NULL THEN
        RAISE EXCEPTION 'Missing required accounts for GL posting';
    END IF;

    -- Generate transaction number
    SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 5) AS INTEGER)), 0) + 1 
    INTO v_next_txn_num 
    FROM ledger_transactions 
    WHERE "TransactionNumber" LIKE 'TXN-%';
    
    v_txn_number := 'TXN-' || LPAD(v_next_txn_num::TEXT, 6, '0');
    v_transaction_id := gen_random_uuid();

    -- Create transaction header (4 lines: Cash DR, Revenue CR, COGS DR, Inventory CR)
    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "ReferenceType",
        "ReferenceId", "ReferenceNumber", "Description",
        "TotalDebitAmount", "TotalCreditAmount", "Status",
        "IdempotencyKey", "CreatedBy", "CreatedAt", "UpdatedAt", "IsReversed"
    ) VALUES (
        v_transaction_id,
        v_txn_number,
        v_sale_date,
        'SALE',
        v_sale_id,
        v_sale_number,
        'Sale: ' || v_sale_number,
        v_total_amount + v_cost_amount,  -- Total debits = revenue + COGS
        v_total_amount + v_cost_amount,  -- Total credits = revenue + COGS
        'POSTED',
        'SALE-' || v_sale_id,
        '00000000-0000-0000-0000-000000000000',
        NOW(),
        NOW(),
        false
    );

    -- Entry 1: DR Cash (1010) for total amount
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
    ) VALUES (
        gen_random_uuid(),
        v_transaction_id,
        v_cash_account_id,
        'DEBIT',
        v_total_amount,
        v_total_amount,
        0,
        'Cash payment received for ' || v_sale_number,
        1,
        NOW()
    );

    -- Entry 2: CR Sales Revenue (4000) for total amount
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
    ) VALUES (
        gen_random_uuid(),
        v_transaction_id,
        v_revenue_account_id,
        'CREDIT',
        v_total_amount,
        0,
        v_total_amount,
        'Sales revenue for ' || v_sale_number,
        2,
        NOW()
    );

    -- Entry 3: DR COGS (5000) for cost amount
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
    ) VALUES (
        gen_random_uuid(),
        v_transaction_id,
        v_cogs_account_id,
        'DEBIT',
        v_cost_amount,
        v_cost_amount,
        0,
        'Cost of goods sold for ' || v_sale_number,
        3,
        NOW()
    );

    -- Entry 4: CR Inventory (1300) for cost amount
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
    ) VALUES (
        gen_random_uuid(),
        v_transaction_id,
        v_inventory_account_id,
        'CREDIT',
        v_cost_amount,
        0,
        v_cost_amount,
        'Inventory reduction for ' || v_sale_number,
        4,
        NOW()
    );

    -- Update account balances
    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_total_amount WHERE "Id" = v_cash_account_id;
    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_total_amount WHERE "Id" = v_revenue_account_id;
    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_cost_amount WHERE "Id" = v_cogs_account_id;
    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - v_cost_amount WHERE "Id" = v_inventory_account_id;

    RAISE NOTICE 'Successfully posted GL entries for %: TXN %', v_sale_number, v_txn_number;
    RAISE NOTICE 'DR Cash: %, CR Revenue: %, DR COGS: %, CR Inventory: %', 
                 v_total_amount, v_total_amount, v_cost_amount, v_cost_amount;
END $$;

-- Verify the entries were created
SELECT lt."TransactionNumber", lt."ReferenceNumber", lt."TotalDebitAmount", lt."TotalCreditAmount"
FROM ledger_transactions lt 
WHERE lt."ReferenceNumber" = 'SALE-2025-0001';

SELECT a."AccountCode", a."AccountName", le."DebitAmount", le."CreditAmount"
FROM ledger_entries le 
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE lt."ReferenceNumber" = 'SALE-2025-0001'
ORDER BY le."LineNumber";
