-- ============================================================================
-- AUTOMATIC GENERAL LEDGER POSTING TRIGGERS
-- ============================================================================
-- This script creates PostgreSQL triggers to automatically post journal entries
-- to the general ledger when business transactions occur.
--
-- Supported transactions:
--   1. Sales (COMPLETED) - DR Cash/AR, CR Revenue, DR COGS, CR Inventory
--   2. Goods Receipts (FINALIZED) - DR Inventory, CR Accounts Payable
--   3. Expenses (APPROVED) - DR Expense, CR Cash/AP
--   4. Customer Payments - DR Cash, CR Accounts Receivable
--   5. Sale Voids - Reverse original entries
--
-- Run this script on the pos_system database.
-- ============================================================================

-- Helper function to generate transaction numbers
CREATE OR REPLACE FUNCTION generate_ledger_transaction_number()
RETURNS TEXT AS $$
DECLARE
    next_num INTEGER;
    year_part TEXT;
BEGIN
    year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Extract the numeric sequence after LT-YYYY- pattern
    SELECT COALESCE(MAX(
        CAST(SUBSTRING("TransactionNumber" FROM 'LT-' || year_part || '-([0-9]+)') AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM ledger_transactions
    WHERE "TransactionNumber" LIKE 'LT-' || year_part || '-%';
    
    RETURN 'LT-' || year_part || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SALE COMPLETED TRIGGER
-- When a sale is completed, create journal entries:
--   DR Cash/Credit Card/AR (based on payment method) = total_amount
--   CR Sales Revenue = total_amount
--   DR Cost of Goods Sold = total_cost
--   CR Inventory = total_cost
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_sale_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_ar_account_id UUID;
    v_credit_card_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_debit_account_id UUID;
    v_line_number INTEGER := 0;
BEGIN
    -- Only trigger on status change to COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        
        -- Get account IDs from Chart of Accounts
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_credit_card_account_id FROM accounts WHERE "AccountCode" = '1020';
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
        SELECT "Id" INTO v_cogs_account_id FROM accounts WHERE "AccountCode" = '5000';
        SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
        
        -- Determine debit account based on payment method
        CASE NEW.payment_method::TEXT
            WHEN 'CASH' THEN v_debit_account_id := v_cash_account_id;
            WHEN 'CARD' THEN v_debit_account_id := v_credit_card_account_id;
            WHEN 'CREDIT' THEN v_debit_account_id := v_ar_account_id;
            WHEN 'MOBILE_MONEY' THEN v_debit_account_id := v_cash_account_id; -- Treat as cash
            ELSE v_debit_account_id := v_cash_account_id;
        END CASE;
        
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
            CURRENT_TIMESTAMP,
            'SALE',
            NEW.id,
            NEW.sale_number,
            'Sale: ' || NEW.sale_number,
            COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
            COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- Entry 1: DR Cash/Card/AR (amount received)
        v_line_number := v_line_number + 1;
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
            'Sale payment - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Entry 2: CR Sales Revenue
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
            COALESCE(NEW.total_amount, 0),
            0,
            COALESCE(NEW.total_amount, 0),
            'Sales revenue - ' || NEW.sale_number,
            v_line_number,
            'SALE',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Entry 3: DR Cost of Goods Sold (if total_cost > 0)
        IF COALESCE(NEW.total_cost, 0) > 0 THEN
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
                COALESCE(NEW.total_cost, 0),
                COALESCE(NEW.total_cost, 0),
                0,
                'Cost of goods sold - ' || NEW.sale_number,
                v_line_number,
                'SALE',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
            
            -- Entry 4: CR Inventory
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
                COALESCE(NEW.total_cost, 0),
                0,
                COALESCE(NEW.total_cost, 0),
                'Inventory reduction - ' || NEW.sale_number,
                v_line_number,
                'SALE',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
        END IF;
        
        -- Update account balances
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_debit_account_id;
        
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_revenue_account_id;
        
        IF COALESCE(NEW.total_cost, 0) > 0 THEN
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_cost, 0), "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_cogs_account_id;
            
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - COALESCE(NEW.total_cost, 0), "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_inventory_account_id;
        END IF;
        
        RAISE NOTICE 'Posted sale % to ledger as transaction %', NEW.sale_number, v_transaction_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sales
DROP TRIGGER IF EXISTS trg_post_sale_to_ledger ON sales;
CREATE TRIGGER trg_post_sale_to_ledger
    AFTER INSERT OR UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_sale_to_ledger();

-- ============================================================================
-- SALE VOID TRIGGER
-- When a sale is voided, reverse the original journal entries
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_sale_void_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_original_transaction_id UUID;
    v_reversal_transaction_id UUID;
    v_transaction_number TEXT;
    v_entry RECORD;
    v_line_number INTEGER := 0;
BEGIN
    -- Only trigger when voided_at is set
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
        
        -- Find original ledger transaction
        SELECT "Id" INTO v_original_transaction_id
        FROM ledger_transactions
        WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id AND "IsReversed" = FALSE
        LIMIT 1;
        
        IF v_original_transaction_id IS NOT NULL THEN
            -- Generate reversal transaction
            v_transaction_number := generate_ledger_transaction_number();
            v_reversal_transaction_id := gen_random_uuid();
            
            -- Create reversal ledger transaction
            INSERT INTO ledger_transactions (
                "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                "Status", "CreatedAt", "UpdatedAt", "IsReversed", "OriginalTransactionId"
            ) VALUES (
                v_reversal_transaction_id,
                v_transaction_number,
                CURRENT_TIMESTAMP,
                'SALE_VOID',
                NEW.id,
                NEW.sale_number,
                'VOID: Sale ' || NEW.sale_number || ' - ' || COALESCE(NEW.void_reason, 'No reason'),
                COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
                COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
                'POSTED',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                FALSE,
                v_original_transaction_id
            );
            
            -- Reverse each original entry (swap debits and credits)
            FOR v_entry IN 
                SELECT * FROM ledger_entries WHERE "LedgerTransactionId" = v_original_transaction_id
            LOOP
                v_line_number := v_line_number + 1;
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
                    "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
                    "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(),
                    v_reversal_transaction_id,
                    v_reversal_transaction_id,
                    v_entry."AccountId",
                    CASE WHEN v_entry."EntryType" = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
                    v_entry."Amount",
                    v_entry."CreditAmount", -- Swap
                    v_entry."DebitAmount",  -- Swap
                    'REVERSAL: ' || v_entry."Description",
                    v_line_number,
                    v_entry."EntityType",
                    v_entry."EntityId",
                    CURRENT_TIMESTAMP,
                    0,
                    CURRENT_TIMESTAMP
                );
                
                -- Reverse the account balance update
                IF v_entry."EntryType" = 'DEBIT' THEN
                    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - v_entry."Amount", "UpdatedAt" = CURRENT_TIMESTAMP
                    WHERE "Id" = v_entry."AccountId";
                ELSE
                    UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - v_entry."Amount", "UpdatedAt" = CURRENT_TIMESTAMP
                    WHERE "Id" = v_entry."AccountId";
                END IF;
            END LOOP;
            
            -- Mark original transaction as reversed
            UPDATE ledger_transactions 
            SET "IsReversed" = TRUE, "ReversalTransactionId" = v_reversal_transaction_id, "ReversedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_original_transaction_id;
            
            RAISE NOTICE 'Posted void reversal for sale % as transaction %', NEW.sale_number, v_transaction_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sale voids
DROP TRIGGER IF EXISTS trg_post_sale_void_to_ledger ON sales;
CREATE TRIGGER trg_post_sale_void_to_ledger
    AFTER UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_sale_void_to_ledger();

-- ============================================================================
-- GOODS RECEIPT FINALIZED TRIGGER
-- When a goods receipt is finalized:
--   DR Inventory = total value
--   CR Accounts Payable = total value
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_goods_receipt_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_inventory_account_id UUID;
    v_ap_account_id UUID;
    v_total_value NUMERIC;
    v_gr_number TEXT;
BEGIN
    -- Only trigger on status change to COMPLETED
    IF NEW.status = 'COMPLETED' AND OLD.status = 'DRAFT' THEN
        
        -- Get account IDs
        SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';
        
        -- Calculate total value of goods received
        SELECT COALESCE(SUM(received_quantity * cost_price), 0)
        INTO v_total_value
        FROM goods_receipt_items
        WHERE goods_receipt_id = NEW.id;
        
        v_gr_number := NEW.receipt_number;
        
        IF v_total_value > 0 THEN
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
                'GOODS_RECEIPT',
                NEW.id,
                v_gr_number,
                'Goods Receipt: ' || v_gr_number,
                v_total_value,
                v_total_value,
                'POSTED',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                FALSE
            );
            
            -- DR Inventory
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
                v_total_value,
                v_total_value,
                0,
                'Inventory received - ' || v_gr_number,
                1,
                'GOODS_RECEIPT',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
            
            -- CR Accounts Payable
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
                "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
                "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
            ) VALUES (
                gen_random_uuid(),
                v_transaction_id,
                v_transaction_id,
                v_ap_account_id,
                'CREDIT',
                v_total_value,
                0,
                v_total_value,
                'Payable for goods - ' || v_gr_number,
                2,
                'GOODS_RECEIPT',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
            
            -- Update account balances
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_total_value, "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_inventory_account_id;
            
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + v_total_value, "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_ap_account_id;
            
            RAISE NOTICE 'Posted goods receipt % to ledger as transaction % (value: %)', v_gr_number, v_transaction_number, v_total_value;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for goods receipts
DROP TRIGGER IF EXISTS trg_post_goods_receipt_to_ledger ON goods_receipts;
CREATE TRIGGER trg_post_goods_receipt_to_ledger
    AFTER UPDATE ON goods_receipts
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_goods_receipt_to_ledger();

-- ============================================================================
-- EXPENSE APPROVED TRIGGER
-- When an expense is approved:
--   DR Expense Category Account
--   CR Cash or Accounts Payable
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_expense_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_expense_account_id UUID;
    v_cash_account_id UUID;
    v_ap_account_id UUID;
    v_credit_account_id UUID;
    v_category_account_code TEXT;
BEGIN
    -- Only trigger on status change to APPROVED
    IF NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status != 'APPROVED') THEN
        
        -- Get default expense account (General Expense)
        SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';
        
        -- Try to map expense category to specific account
        SELECT ec.ledger_account_code INTO v_category_account_code
        FROM expense_categories ec
        WHERE ec.id = NEW.category_id;
        
        IF v_category_account_code IS NOT NULL THEN
            SELECT "Id" INTO v_expense_account_id 
            FROM accounts 
            WHERE "AccountCode" = v_category_account_code;
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
                CURRENT_TIMESTAMP,
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
            
            -- DR Expense Account
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
                "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
                "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
            ) VALUES (
                gen_random_uuid(),
                v_transaction_id,
                v_transaction_id,
                v_expense_account_id,
                'DEBIT',
                COALESCE(NEW.amount, 0),
                COALESCE(NEW.amount, 0),
                0,
                'Expense - ' || COALESCE(NEW.description, NEW.expense_number),
                1,
                'EXPENSE',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
            
            -- CR Cash or AP
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
                COALESCE(NEW.amount, 0),
                0,
                COALESCE(NEW.amount, 0),
                'Payment for expense - ' || COALESCE(NEW.description, NEW.expense_number),
                2,
                'EXPENSE',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
            
            -- Update account balances
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_expense_account_id;
            
            IF NEW.payment_status = 'PAID' THEN
                UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - COALESCE(NEW.amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
                WHERE "Id" = v_credit_account_id;
            ELSE
                UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
                WHERE "Id" = v_credit_account_id;
            END IF;
            
            RAISE NOTICE 'Posted expense % to ledger as transaction %', NEW.expense_number, v_transaction_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for expenses
DROP TRIGGER IF EXISTS trg_post_expense_to_ledger ON expenses;
CREATE TRIGGER trg_post_expense_to_ledger
    AFTER INSERT OR UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_expense_to_ledger();

-- ============================================================================
-- CUSTOMER PAYMENT TRIGGER
-- When a customer makes a payment on credit:
--   DR Cash = payment amount
--   CR Accounts Receivable = payment amount
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_customer_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_ar_account_id UUID;
    v_customer_name TEXT;
BEGIN
    -- Get account IDs
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    
    -- Get customer name
    SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
    
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
            CURRENT_TIMESTAMP,
            'CUSTOMER_PAYMENT',
            NEW.id,
            NEW.payment_number,
            'Customer Payment: ' || COALESCE(v_customer_name, 'Unknown') || ' - ' || NEW.payment_number,
            COALESCE(NEW.amount, 0),
            COALESCE(NEW.amount, 0),
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
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_cash_account_id,
            'DEBIT',
            COALESCE(NEW.amount, 0),
            COALESCE(NEW.amount, 0),
            0,
            'Payment received - ' || COALESCE(v_customer_name, 'Unknown'),
            1,
            'CUSTOMER_PAYMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_ar_account_id,
            'CREDIT',
            COALESCE(NEW.amount, 0),
            0,
            COALESCE(NEW.amount, 0),
            'AR reduced - ' || COALESCE(v_customer_name, 'Unknown'),
            2,
            'CUSTOMER_PAYMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update account balances
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_cash_account_id;
        
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - COALESCE(NEW.amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_ar_account_id;
        
        RAISE NOTICE 'Posted customer payment % to ledger as transaction %', NEW.payment_number, v_transaction_number;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for customer payments
DROP TRIGGER IF EXISTS trg_post_customer_payment_to_ledger ON customer_payments;
CREATE TRIGGER trg_post_customer_payment_to_ledger
    AFTER INSERT ON customer_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_post_customer_payment_to_ledger();

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Check all GL triggers are created:
SELECT 
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers 
WHERE trigger_name LIKE 'trg_post_%_to_ledger'
ORDER BY event_object_table;
