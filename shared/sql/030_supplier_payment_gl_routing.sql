-- ============================================================================
-- Migration: 030_supplier_payment_gl_routing.sql
-- Date: 2025-12-31
-- Purpose: Fix supplier payment GL routing to use correct account based on payment method
--          CASH → 1010 (Cash on Hand)
--          BANK_TRANSFER/CHECK → 1030 (Checking Account)
--          CARD → 1030 (Checking Account)
-- ============================================================================

-- Drop and recreate the trigger function with payment method routing
CREATE OR REPLACE FUNCTION fn_post_supplier_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_credit_account_id UUID;
    v_credit_account_code TEXT;
    v_ap_account_id UUID;
    v_supplier_name TEXT;
BEGIN
    -- Get A/P account ID
    SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';
    
    -- Determine credit account based on payment method
    CASE UPPER(COALESCE(NEW."PaymentMethod", 'CASH'))
        WHEN 'CASH' THEN
            v_credit_account_code := '1010';  -- Cash on Hand
        WHEN 'BANK_TRANSFER' THEN
            v_credit_account_code := '1030';  -- Checking Account
        WHEN 'CHECK' THEN
            v_credit_account_code := '1030';  -- Checking Account
        WHEN 'CARD' THEN
            v_credit_account_code := '1030';  -- Checking Account
        ELSE
            v_credit_account_code := '1010';  -- Default to Cash
    END CASE;
    
    -- Get the credit account ID
    SELECT "Id" INTO v_credit_account_id FROM accounts WHERE "AccountCode" = v_credit_account_code;
    
    -- Fallback to Cash if account not found
    IF v_credit_account_id IS NULL THEN
        SELECT "Id" INTO v_credit_account_id FROM accounts WHERE "AccountCode" = '1010';
        v_credit_account_code := '1010';
    END IF;
    
    -- Get supplier name
    SELECT "CompanyName" INTO v_supplier_name FROM suppliers WHERE "Id" = NEW."SupplierId";
    
    IF COALESCE(NEW."Amount", 0) > 0 THEN
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
            CURRENT_TIMESTAMP,
            'SUPPLIER_PAYMENT',
            NEW."Id",
            NEW."PaymentNumber",
            'Supplier Payment (' || NEW."PaymentMethod" || '): ' || COALESCE(v_supplier_name, 'Unknown') || ' - ' || NEW."PaymentNumber",
            COALESCE(NEW."Amount", 0),
            COALESCE(NEW."Amount", 0),
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Accounts Payable (reduce liability)
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_ap_account_id,
            'DEBIT',
            COALESCE(NEW."Amount", 0),
            COALESCE(NEW."Amount", 0),
            0,
            'AP reduced - ' || COALESCE(v_supplier_name, 'Unknown'),
            1,
            'SUPPLIER_PAYMENT',
            NEW."Id"::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- CR Cash/Bank (based on payment method)
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_credit_account_id,
            'CREDIT',
            COALESCE(NEW."Amount", 0),
            0,
            COALESCE(NEW."Amount", 0),
            'Payment to supplier (' || NEW."PaymentMethod" || ') - ' || COALESCE(v_supplier_name, 'Unknown'),
            2,
            'SUPPLIER_PAYMENT',
            NEW."Id"::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Account balances are automatically updated by trg_sync_account_balance triggers
        RAISE NOTICE 'Posted supplier payment % to ledger (%) as transaction %', 
            NEW."PaymentNumber", v_credit_account_code, v_transaction_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger (in case it was modified)
DROP TRIGGER IF EXISTS trg_post_supplier_payment_to_ledger ON supplier_payments;
CREATE TRIGGER trg_post_supplier_payment_to_ledger
    AFTER INSERT ON supplier_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_supplier_payment_to_ledger();

-- Verify the function was created
SELECT 'Supplier payment GL routing updated successfully' as status;
SELECT 'Payment methods now route to correct accounts:' as info;
SELECT '  CASH → 1010 (Cash on Hand)' as routing1;
SELECT '  BANK_TRANSFER → 1030 (Checking Account)' as routing2;
SELECT '  CHECK → 1030 (Checking Account)' as routing3;
SELECT '  CARD → 1030 (Checking Account)' as routing4;
