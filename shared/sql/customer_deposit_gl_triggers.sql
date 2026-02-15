-- ============================================================================
-- CUSTOMER DEPOSIT GL POSTING TRIGGERS
-- ============================================================================
-- When a customer makes a deposit (advance payment):
--   DR Cash (1010) - Increase cash
--   CR Customer Deposits (2200) - Liability to customer (we owe them goods/services)
--
-- When a deposit is applied to a sale:
--   DR Customer Deposits (2200) - Reduce liability
--   CR Accounts Receivable (1200) or Revenue (4000) - Depending on flow
-- ============================================================================

-- 1. Post deposit to GL when created
CREATE OR REPLACE FUNCTION fn_post_customer_deposit_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_deposit_account_id UUID;
    v_customer_name TEXT;
    v_line_number INTEGER := 0;
BEGIN
    -- Only post on INSERT (new deposit)
    IF TG_OP = 'INSERT' THEN
        
        -- Get customer name
        SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
        
        -- Get GL account IDs
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_deposit_account_id FROM accounts WHERE "AccountCode" = '2200';
        
        IF v_cash_account_id IS NULL OR v_deposit_account_id IS NULL THEN
            RAISE WARNING 'GL accounts not found for deposit posting (Cash=1010, Deposits=2200)';
            RETURN NEW;
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'CUSTOMER_DEPOSIT',
            NEW.id,
            NEW.deposit_number,
            'Customer Deposit: ' || NEW.deposit_number || ' - ' || COALESCE(v_customer_name, 'Unknown'),
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- Entry 1: DR Cash (we received money)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_cash_account_id,
            'DEBIT',
            NEW.amount,
            NEW.amount,
            0,
            'Deposit received - ' || COALESCE(v_customer_name, 'Customer') || ' - ' || NEW.payment_method,
            v_line_number,
            'CUSTOMER_DEPOSIT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Entry 2: CR Customer Deposits (liability - we owe them goods/services)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_deposit_account_id,
            'CREDIT',
            NEW.amount,
            0,
            NEW.amount,
            'Customer deposit liability - ' || COALESCE(v_customer_name, 'Customer'),
            v_line_number,
            'CUSTOMER_DEPOSIT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update account balances
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + NEW.amount, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_cash_account_id;
        
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + NEW.amount, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_deposit_account_id;
        
        RAISE NOTICE 'Posted customer deposit % (%) to ledger as %', NEW.deposit_number, NEW.amount, v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- 2. Post deposit application to GL when used
-- BUG FIX: Deposit application should CR Accounts Receivable, NOT Revenue
-- When a deposit is applied to a sale:
--   - The sale already posted: DR AR, CR Revenue (if credit sale)
--   - Deposit application should: DR Customer Deposits, CR AR
-- This reduces both the deposit liability AND the AR, netting to zero for the customer
CREATE OR REPLACE FUNCTION fn_post_deposit_application_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_deposit_account_id UUID;
    v_ar_account_id UUID;  -- BUG FIX: Changed from v_revenue_account_id
    v_customer_name TEXT;
    v_deposit_number TEXT;
    v_line_number INTEGER := 0;
BEGIN
    -- Only post on INSERT (new application)
    IF TG_OP = 'INSERT' THEN
        
        -- Get deposit and customer info
        SELECT d.deposit_number, c.name 
        INTO v_deposit_number, v_customer_name
        FROM pos_customer_deposits d
        JOIN customers c ON c.id = d.customer_id
        WHERE d.id = NEW.deposit_id;
        
        -- Get GL account IDs
        -- BUG FIX: Use AR (1200) instead of Revenue (4000)
        SELECT "Id" INTO v_deposit_account_id FROM accounts WHERE "AccountCode" = '2200';
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        
        IF v_deposit_account_id IS NULL OR v_ar_account_id IS NULL THEN
            RAISE WARNING 'GL accounts not found for deposit application posting (need 2200 and 1200)';
            RETURN NEW;
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'DEPOSIT_APPLICATION',
            NEW.id,
            COALESCE(v_deposit_number, 'DEP-UNKNOWN'),
            'Deposit Applied: ' || COALESCE(v_deposit_number, 'Unknown') || ' - ' || COALESCE(v_customer_name, 'Unknown'),
            NEW.amount_applied,
            NEW.amount_applied,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- Entry 1: DR Customer Deposits (reduce liability)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_deposit_account_id,
            'DEBIT',
            NEW.amount_applied,
            NEW.amount_applied,
            0,
            'Deposit applied to sale - ' || COALESCE(v_customer_name, 'Customer'),
            v_line_number,
            'DEPOSIT_APPLICATION',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Entry 2: CR Accounts Receivable (reduce customer balance)
        -- BUG FIX: Changed from Revenue to AR
        -- Rationale: The sale already recognized revenue when it was recorded.
        -- This entry reduces both the deposit liability AND the AR balance.
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_ar_account_id,  -- BUG FIX: Changed from v_revenue_account_id
            'CREDIT',
            NEW.amount_applied,
            0,
            NEW.amount_applied,
            'Deposit applied to reduce A/R - ' || COALESCE(v_deposit_number, 'Unknown'),
            v_line_number,
            'DEPOSIT_APPLICATION',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update account balances
        -- DR Customer Deposits (liability decreases)
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - NEW.amount_applied, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_deposit_account_id;
        
        -- CR Accounts Receivable (asset decreases) - BUG FIX: Changed from Revenue
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - NEW.amount_applied, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_ar_account_id;
        
        RAISE NOTICE 'Posted deposit application (%) to ledger as % - DR Deposits, CR AR', NEW.amount_applied, v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trg_post_customer_deposit_to_ledger ON pos_customer_deposits;
CREATE TRIGGER trg_post_customer_deposit_to_ledger
    AFTER INSERT ON pos_customer_deposits
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_customer_deposit_to_ledger();

DROP TRIGGER IF EXISTS trg_post_deposit_application_to_ledger ON pos_deposit_applications;
CREATE TRIGGER trg_post_deposit_application_to_ledger
    AFTER INSERT ON pos_deposit_applications
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_deposit_application_to_ledger();

-- ============================================================================
-- BACKFILL EXISTING DEPOSITS TO GL
-- ============================================================================
-- Post existing deposits that were not captured in GL

DO $$
DECLARE
    v_deposit RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_deposit_account_id UUID;
    v_customer_name TEXT;
    v_count INTEGER := 0;
BEGIN
    -- Get account IDs
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    SELECT "Id" INTO v_deposit_account_id FROM accounts WHERE "AccountCode" = '2200';
    
    IF v_cash_account_id IS NULL OR v_deposit_account_id IS NULL THEN
        RAISE NOTICE 'Cannot backfill: GL accounts not found';
        RETURN;
    END IF;
    
    -- Loop through deposits not yet posted to GL
    FOR v_deposit IN 
        SELECT d.*, c.name as customer_name
        FROM pos_customer_deposits d
        JOIN customers c ON c.id = d.customer_id
        WHERE NOT EXISTS (
            SELECT 1 FROM ledger_transactions lt 
            WHERE lt."ReferenceType" = 'CUSTOMER_DEPOSIT' 
            AND lt."ReferenceId" = d.id
        )
    LOOP
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            v_deposit.created_at,
            'CUSTOMER_DEPOSIT',
            v_deposit.id,
            v_deposit.deposit_number,
            'Customer Deposit (Backfill): ' || v_deposit.deposit_number || ' - ' || v_deposit.customer_name,
            v_deposit.amount,
            v_deposit.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Cash
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_cash_account_id, 'DEBIT',
            v_deposit.amount, v_deposit.amount, 0,
            'Deposit received (backfill) - ' || v_deposit.customer_name,
            1, 'CUSTOMER_DEPOSIT', v_deposit.id::TEXT, v_deposit.created_at, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Customer Deposits
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_deposit_account_id, 'CREDIT',
            v_deposit.amount, 0, v_deposit.amount,
            'Customer deposit liability (backfill) - ' || v_deposit.customer_name,
            2, 'CUSTOMER_DEPOSIT', v_deposit.id::TEXT, v_deposit.created_at, 0, CURRENT_TIMESTAMP
        );
        
        v_count := v_count + 1;
        RAISE NOTICE 'Backfilled deposit % (%) to GL', v_deposit.deposit_number, v_deposit.amount;
    END LOOP;
    
    -- Update account balances based on backfilled deposits
    IF v_count > 0 THEN
        -- Get total active deposit amount
        UPDATE accounts 
        SET "CurrentBalance" = (
            SELECT COALESCE(SUM(amount), 0) FROM pos_customer_deposits WHERE status IN ('ACTIVE', 'DEPLETED')
        ),
        "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "AccountCode" = '2200';
        
        RAISE NOTICE 'Backfilled % deposits to GL', v_count;
    END IF;
END;
$$;

-- Verify the backfill
SELECT 'CUSTOMER DEPOSIT GL TRIGGERS INSTALLED' AS status;

SELECT 
    'Deposits in pos_customer_deposits' as source,
    COUNT(*) as count,
    SUM(amount) as total_amount,
    SUM(amount_available) as available
FROM pos_customer_deposits 
WHERE status IN ('ACTIVE', 'DEPLETED')
UNION ALL
SELECT 
    'Customer Deposits in GL (2200)',
    1,
    "CurrentBalance",
    "CurrentBalance"
FROM accounts WHERE "AccountCode" = '2200';
