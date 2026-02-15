-- Migration: Update Sale GL Posting Trigger to Support Service Revenue
-- Date: December 30, 2025
-- Purpose: Modify trigger to split revenue between 4000 (inventory) and 4100 (service)

CREATE OR REPLACE FUNCTION fn_post_sale_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_revenue_account_id UUID;
    v_service_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_line_number INTEGER := 0;
    v_inventory_revenue NUMERIC := 0;
    v_service_revenue NUMERIC := 0;
    v_inventory_cost NUMERIC := 0;
BEGIN
    -- Only post if status is COMPLETED
    IF NEW.status != 'COMPLETED' THEN
        RETURN NEW;
    END IF;
    
    -- Prevent duplicate postings using idempotency check
    IF EXISTS (SELECT 1 FROM ledger_transactions 
               WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id) THEN
        RAISE NOTICE 'Sale % already posted to ledger - skipping duplicate', NEW.sale_number;
        RETURN NEW;
    END IF;
    
    -- Get account IDs
    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010'; -- Cash
    SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000'; -- Sales Revenue (inventory)
    SELECT "Id" INTO v_service_revenue_account_id FROM accounts WHERE "AccountCode" = '4100'; -- Service Revenue
    SELECT "Id" INTO v_cogs_account_id FROM accounts WHERE "AccountCode" = '5000'; -- COGS
    SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300'; -- Inventory
    
    IF v_debit_account_id IS NULL OR v_revenue_account_id IS NULL OR v_service_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Required GL accounts not found (1010, 4000, 4100)';
    END IF;
    
    -- CALCULATE REVENUE AND COST SPLIT BY PRODUCT TYPE
    SELECT 
        COALESCE(SUM(CASE WHEN is_service = false THEN total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN is_service = true THEN total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN is_service = false THEN unit_cost * quantity ELSE 0 END), 0)
    INTO v_inventory_revenue, v_service_revenue, v_inventory_cost
    FROM sale_items
    WHERE sale_id = NEW.id;
    
    RAISE NOTICE 'Sale % revenue split: inventory=%, service=%, inventory_cost=%', 
        NEW.sale_number, v_inventory_revenue, v_service_revenue, v_inventory_cost;
    
    -- Generate transaction number
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
        COALESCE(NEW.sale_date, CURRENT_DATE),
        'SALE',
        NEW.id,
        NEW.sale_number,
        'Sale: ' || NEW.sale_number,
        COALESCE(NEW.total_amount, 0) + v_inventory_cost,
        COALESCE(NEW.total_amount, 0) + v_inventory_cost,
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        FALSE
    );
    
    -- DEBIT: Cash/AR (depending on payment method)
    v_line_number := v_line_number + 1;
    IF NEW.payment_method = 'CREDIT' THEN
        -- Credit sale: Debit AR
        SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1200'; -- AR
        
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_debit_account_id,
            'DEBIT',
            COALESCE(NEW.total_amount, 0),
            COALESCE(NEW.total_amount, 0),
            0,
            'Credit sale - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            COALESCE(NEW.sale_date, CURRENT_DATE),
            0,
            CURRENT_TIMESTAMP
        );
    ELSE
        -- Cash/Card sale: Debit Cash
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_debit_account_id,
            'DEBIT',
            COALESCE(NEW.total_amount, 0),
            COALESCE(NEW.total_amount, 0),
            0,
            'Cash/card payment - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            COALESCE(NEW.sale_date, CURRENT_DATE),
            0,
            CURRENT_TIMESTAMP
        );
    END IF;
    
    -- CREDIT: Inventory Revenue (4000) - Only if there's inventory revenue
    IF v_inventory_revenue > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_revenue_account_id,
            'CREDIT',
            v_inventory_revenue,
            0,
            v_inventory_revenue,
            'Inventory sales revenue - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            COALESCE(NEW.sale_date, CURRENT_DATE),
            0,
            CURRENT_TIMESTAMP
        );
    END IF;
    
    -- CREDIT: Service Revenue (4100) - Only if there's service revenue
    IF v_service_revenue > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_service_revenue_account_id,
            'CREDIT',
            v_service_revenue,
            0,
            v_service_revenue,
            'Service revenue - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            COALESCE(NEW.sale_date, CURRENT_DATE),
            0,
            CURRENT_TIMESTAMP
        );
    END IF;
    
    -- COGS entries - Only for inventory items (exclude service items)
    IF v_inventory_cost > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_cogs_account_id,
            'DEBIT',
            v_inventory_cost,
            v_inventory_cost,
            0,
            'Cost of goods sold - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            COALESCE(NEW.sale_date, CURRENT_DATE),
            0,
            CURRENT_TIMESTAMP
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_inventory_account_id,
            'CREDIT',
            v_inventory_cost,
            0,
            v_inventory_cost,
            'Inventory reduction - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            COALESCE(NEW.sale_date, CURRENT_DATE),
            0,
            CURRENT_TIMESTAMP
        );
    END IF;
    
    -- Update account balances
    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = v_debit_account_id;
    
    IF v_inventory_revenue > 0 THEN
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_inventory_revenue, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_revenue_account_id;
    END IF;
    
    IF v_service_revenue > 0 THEN
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_service_revenue, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_service_revenue_account_id;
    END IF;
    
    IF v_inventory_cost > 0 THEN
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_inventory_cost, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_cogs_account_id;
        
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - v_inventory_cost, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_inventory_account_id;
    END IF;
    
    RAISE NOTICE 'Posted sale % to ledger: inventory_rev=%, service_rev=%, cogs=%', 
        NEW.sale_number, v_inventory_revenue, v_service_revenue, v_inventory_cost;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger
DROP TRIGGER IF EXISTS trg_post_sale_to_ledger ON sales;
CREATE TRIGGER trg_post_sale_to_ledger
    AFTER INSERT OR UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_sale_to_ledger();

COMMENT ON FUNCTION fn_post_sale_to_ledger() IS 
'Posts sales to general ledger with revenue split: inventory items → 4000, service items → 4100. COGS entries exclude service items.';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '==============================================================';
    RAISE NOTICE 'Sale GL Posting Trigger Updated for Service Revenue';
    RAISE NOTICE '==============================================================';
    RAISE NOTICE 'Revenue Posting:';
    RAISE NOTICE '  ✓ Inventory items → Account 4000 (Sales Revenue)';
    RAISE NOTICE '  ✓ Service items → Account 4100 (Service Revenue)';
    RAISE NOTICE '';
    RAISE NOTICE 'COGS Posting:';
    RAISE NOTICE '  ✓ Inventory items → COGS (5000) & Inventory (1300)';
    RAISE NOTICE '  ✓ Service items → No COGS entry (as expected)';
    RAISE NOTICE '==============================================================';
END $$;
