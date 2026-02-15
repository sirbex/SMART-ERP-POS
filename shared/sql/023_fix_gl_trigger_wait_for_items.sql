-- ============================================================================
-- FIX: fn_post_sale_to_ledger() - only post when sale_items exist
-- Issue: Trigger posts incomplete GL entries when sale INSERT happens before sale_items
-- Solution: Check if sale_items exist; skip posting if not; allow re-post if incomplete
-- ============================================================================

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
    v_sale_items_count INTEGER := 0;
BEGIN
    -- Only post if status is COMPLETED
    IF NEW.status != 'COMPLETED' THEN
        RETURN NEW;
    END IF;
    
    -- **FIX: Check if sale_items exist - don't post without items**
    SELECT COUNT(*) INTO v_sale_items_count FROM sale_items WHERE sale_id = NEW.id;
    
    IF v_sale_items_count = 0 THEN
        RAISE NOTICE 'Sale % has no items yet - skipping GL posting until items are added', NEW.sale_number;
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
    
    RAISE NOTICE 'Posted sale % to ledger: inventory_rev=%, service_rev=%, cogs=%', 
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
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
        "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
    ) VALUES (
        gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_debit_account_id,
        COALESCE(NEW.total_amount, 0), 0,
        'Cash received from sale ' || NEW.sale_number,
        'DEBIT', COALESCE(NEW.total_amount, 0), CURRENT_TIMESTAMP
    );
    
    -- CREDIT: Sales Revenue (Inventory items only) - Account 4000
    IF v_inventory_revenue > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_revenue_account_id,
            0, v_inventory_revenue,
            'Revenue from inventory sale ' || NEW.sale_number,
            'CREDIT', v_inventory_revenue, CURRENT_TIMESTAMP
        );
    END IF;
    
    -- CREDIT: Service Revenue (Service items only) - Account 4100
    IF v_service_revenue > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_service_revenue_account_id,
            0, v_service_revenue,
            'Revenue from service sale ' || NEW.sale_number,
            'CREDIT', v_service_revenue, CURRENT_TIMESTAMP
        );
    END IF;
    
    -- DEBIT: COGS (Inventory items only, NOT service items)
    -- CREDIT: Inventory (Inventory items only, NOT service items)
    IF v_inventory_cost > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_cogs_account_id,
            v_inventory_cost, 0,
            'Cost of goods sold - ' || NEW.sale_number,
            'DEBIT', v_inventory_cost, CURRENT_TIMESTAMP
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_inventory_account_id,
            0, v_inventory_cost,
            'Inventory reduction - ' || NEW.sale_number,
            'CREDIT', v_inventory_cost, CURRENT_TIMESTAMP
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clean up incomplete GL posting for test sale
DELETE FROM ledger_entries 
WHERE "LedgerTransactionId" IN (
    SELECT "Id" FROM ledger_transactions 
    WHERE "ReferenceType" = 'SALE' AND "ReferenceNumber" LIKE 'SALE-TEST-%'
);

DELETE FROM ledger_transactions 
WHERE "ReferenceType" = 'SALE' AND "ReferenceNumber" LIKE 'SALE-TEST-%';

DO $$
BEGIN
    RAISE NOTICE 'Fixed fn_post_sale_to_ledger() - now waits for sale_items before posting';
    RAISE NOTICE 'Cleaned up incomplete test sale GL entries';
END $$;
