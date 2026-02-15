-- ============================================================================
-- INVENTORY ADJUSTMENT GL POSTING TRIGGERS
-- ============================================================================
-- Creates GL entries for physical count adjustments and other inventory movements
--
-- Accounts used:
--   5110 - Inventory Shrinkage (EXPENSE) - for losses
--   5120 - Inventory Damage (EXPENSE) - for damaged goods
--   5130 - Inventory Expiry (EXPENSE) - for expired goods
--   4110 - Inventory Overage (REVENUE) - for gains
--   1300 - Inventory (ASSET) - main inventory account
-- ============================================================================

-- Step 1: Create the new accounts if they don't exist
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance")
SELECT gen_random_uuid(), '5110', 'Inventory Shrinkage', 'EXPENSE', 'DEBIT', NULL, 1, TRUE, TRUE, 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5110');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance")
SELECT gen_random_uuid(), '5120', 'Inventory Damage', 'EXPENSE', 'DEBIT', NULL, 1, TRUE, TRUE, 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5120');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance")
SELECT gen_random_uuid(), '5130', 'Inventory Expiry', 'EXPENSE', 'DEBIT', NULL, 1, TRUE, TRUE, 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5130');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance")
SELECT gen_random_uuid(), '4110', 'Inventory Overage', 'REVENUE', 'CREDIT', NULL, 1, TRUE, TRUE, 0
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4110');

-- Step 2: Create the GL posting trigger for stock movements
CREATE OR REPLACE FUNCTION fn_post_stock_movement_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_inventory_account_id UUID;
    v_adjustment_account_id UUID;
    v_line_number INTEGER := 0;
    v_product_name TEXT;
    v_movement_value NUMERIC;
    v_description TEXT;
BEGIN
    -- Only post for adjustment-type movements (not SALE or GOODS_RECEIPT - those have their own triggers)
    IF NEW.movement_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'PHYSICAL_COUNT') THEN
        RETURN NEW;
    END IF;
    
    -- Calculate movement value
    v_movement_value := COALESCE(NEW.quantity * COALESCE(NEW.unit_cost, 0), 0);
    
    -- Skip if no value (avoid zero-value entries)
    IF v_movement_value <= 0 THEN
        RAISE WARNING 'Skipping GL posting for stock movement % - zero or negative value', NEW.movement_number;
        RETURN NEW;
    END IF;
    
    -- Get product name for description
    SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;
    v_description := 'Stock ' || NEW.movement_type || ': ' || COALESCE(v_product_name, 'Unknown') || ' - ' || NEW.movement_number;
    
    -- Get account IDs
    SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
    
    IF v_inventory_account_id IS NULL THEN
        RAISE EXCEPTION 'Inventory account 1300 not found - cannot post stock movement';
    END IF;
    
    -- Determine which adjustment account to use based on movement type
    CASE NEW.movement_type
        WHEN 'ADJUSTMENT_OUT' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5110'; -- Shrinkage
        WHEN 'DAMAGE' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5120'; -- Damage
        WHEN 'EXPIRY' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5130'; -- Expiry
        WHEN 'ADJUSTMENT_IN' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '4110'; -- Overage
        WHEN 'PHYSICAL_COUNT' THEN
            -- Physical count could be + or - but we receive it as positive quantity
            -- The movement_type tells us direction
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5110'; -- Default to shrinkage
        ELSE
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5110'; -- Default
    END CASE;
    
    IF v_adjustment_account_id IS NULL THEN
        RAISE WARNING 'Adjustment account not found for movement type % - skipping GL posting', NEW.movement_type;
        RETURN NEW;
    END IF;
    
    -- Generate transaction number
    v_transaction_number := COALESCE(
        (SELECT generate_ledger_transaction_number()),
        'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
        LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
              FROM ledger_transactions)::TEXT, 6, '0')
    );
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
        'STOCK_MOVEMENT',
        NEW.id,
        NEW.movement_number,
        v_description,
        v_movement_value,
        v_movement_value,
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        FALSE
    );
    
    -- Post entries based on movement type
    IF NEW.movement_type IN ('ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY') THEN
        -- SHRINKAGE/LOSS: DR Expense, CR Inventory
        
        -- Entry 1: DR Expense (Shrinkage/Damage/Expiry)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_adjustment_account_id,
            'DEBIT',
            v_movement_value,
            v_movement_value,
            0,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update expense account balance (debit increases expense)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" + v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_adjustment_account_id;
        
        -- Entry 2: CR Inventory (reduce asset)
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
            v_movement_value,
            0,
            v_movement_value,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update inventory account balance (credit decreases asset)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" - v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_inventory_account_id;
        
    ELSIF NEW.movement_type = 'ADJUSTMENT_IN' THEN
        -- OVERAGE/GAIN: DR Inventory, CR Revenue
        
        -- Entry 1: DR Inventory (increase asset)
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
            'DEBIT',
            v_movement_value,
            v_movement_value,
            0,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update inventory account balance (debit increases asset)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" + v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_inventory_account_id;
        
        -- Entry 2: CR Overage Revenue
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_adjustment_account_id,
            'CREDIT',
            v_movement_value,
            0,
            v_movement_value,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update overage account balance (credit increases revenue)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" + v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_adjustment_account_id;
    END IF;
    
    RAISE NOTICE 'Posted GL entry for stock movement %: % = %', NEW.movement_number, NEW.movement_type, v_movement_value;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to post stock movement to GL: % - %', SQLERRM, NEW.movement_number;
        RETURN NEW; -- Don't fail the movement, just log warning
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create the trigger
DROP TRIGGER IF EXISTS trg_post_stock_movement_to_ledger ON stock_movements;
CREATE TRIGGER trg_post_stock_movement_to_ledger
    AFTER INSERT ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_stock_movement_to_ledger();

-- Step 4: Verify accounts were created
SELECT "AccountCode", "AccountName", "AccountType", "NormalBalance" 
FROM accounts 
WHERE "AccountCode" IN ('5110', '5120', '5130', '4110')
ORDER BY "AccountCode";

-- Confirmation
SELECT 'Inventory adjustment GL triggers created successfully' AS status;
