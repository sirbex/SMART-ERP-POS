-- ============================================================================
-- FIX GL TRIGGER EXCEPTIONS - CRITICAL ACCOUNTING INTEGRITY
-- ============================================================================
-- Date: 2025-12-29
-- Issue: Triggers were swallowing GL posting errors with RAISE WARNING + RETURN NEW
-- Fix: Change to RAISE EXCEPTION to ensure atomic transactions
--
-- RATIONALE: If a sale/deposit/payment commits but GL fails, the ledger becomes
-- inconsistent with the business data. Better to fail the entire transaction
-- than have orphaned records.
-- ============================================================================

-- ============================================================================
-- 1. FIX SALE GL POSTING TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_sale_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_ar_account_id UUID;
    v_line_number INTEGER := 0;
    v_existing_entry UUID;
BEGIN
    -- Only post when sale is COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD IS NULL OR OLD.status != 'COMPLETED') THEN
        
        -- Check if already posted (idempotency)
        SELECT lt."Id" INTO v_existing_entry
        FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'SALE' AND lt."ReferenceId" = NEW.id;
        
        IF v_existing_entry IS NOT NULL THEN
            RETURN NEW; -- Already posted, skip
        END IF;
        
        -- Get GL account IDs based on payment method
        IF NEW.payment_method = 'CREDIT' THEN
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1200'; -- AR
        ELSIF NEW.payment_method = 'DEPOSIT' THEN
            -- For DEPOSIT sales, no Cash/AR debit needed - deposit application handles it
            v_debit_account_id := NULL;
        ELSE
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010'; -- Cash
        END IF;
        
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
        SELECT "Id" INTO v_cogs_account_id FROM accounts WHERE "AccountCode" = '5000';
        SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
        
        -- CRITICAL: Validate required accounts exist
        IF v_revenue_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: Revenue account 4000 not found - cannot post sale %', NEW.sale_number;
        END IF;
        
        IF v_debit_account_id IS NULL AND NEW.payment_method NOT IN ('DEPOSIT') THEN
            RAISE EXCEPTION 'CRITICAL: Debit account not found for payment method % - cannot post sale %', 
                NEW.payment_method, NEW.sale_number;
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
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'SALE',
            NEW.id,
            NEW.sale_number,
            'Sale: ' || NEW.sale_number || ' (' || NEW.payment_method || ')',
            COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
            COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            'SALE-' || NEW.id::TEXT
        );
        
        -- Create ledger entries
        -- Only create debit entry for non-DEPOSIT sales
        IF v_debit_account_id IS NOT NULL THEN
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
                CASE WHEN NEW.payment_method = 'CREDIT' THEN 'AR increase' ELSE 'Cash received' END || ' - ' || NEW.sale_number,
                v_line_number,
                'SALE',
                NEW.id::TEXT,
                CURRENT_TIMESTAMP,
                0,
                CURRENT_TIMESTAMP
            );
        END IF;
        
        -- Credit Revenue
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
        
        -- COGS entries (if applicable)
        IF COALESCE(NEW.total_cost, 0) > 0 AND v_cogs_account_id IS NOT NULL AND v_inventory_account_id IS NOT NULL THEN
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
        IF v_debit_account_id IS NOT NULL THEN
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_debit_account_id;
        END IF;
        
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_amount, 0), "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_revenue_account_id;
        
        IF COALESCE(NEW.total_cost, 0) > 0 THEN
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" + COALESCE(NEW.total_cost, 0), "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_cogs_account_id;
            
            UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - COALESCE(NEW.total_cost, 0), "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_inventory_account_id;
        END IF;
        
        RAISE NOTICE 'Posted sale % to ledger as % (payment: %)', NEW.sale_number, v_transaction_number, NEW.payment_method;
    END IF;
    
    RETURN NEW;
-- CRITICAL FIX: No EXCEPTION block - let errors propagate to fail the transaction
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. FIX CUSTOMER DEPOSIT GL POSTING TRIGGER  
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_customer_deposit_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_deposit_account_id UUID;
    v_customer_name TEXT;
    v_line_number INTEGER := 0;
    v_existing_entry UUID;
BEGIN
    -- Only post on INSERT (new deposit)
    IF TG_OP = 'INSERT' THEN
        
        -- Check if already posted (idempotency)
        SELECT lt."Id" INTO v_existing_entry
        FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'CUSTOMER_DEPOSIT' AND lt."ReferenceId" = NEW.id;
        
        IF v_existing_entry IS NOT NULL THEN
            RETURN NEW;
        END IF;
        
        -- Get customer name
        SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
        
        -- Get GL account IDs
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_deposit_account_id FROM accounts WHERE "AccountCode" = '2200';
        
        -- CRITICAL: Validate required accounts
        IF v_cash_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: Cash account 1010 not found - cannot post deposit %', NEW.deposit_number;
        END IF;
        IF v_deposit_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: Customer Deposits account 2200 not found - cannot post deposit %', NEW.deposit_number;
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
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'CUSTOMER_DEPOSIT',
            NEW.id,
            NEW.deposit_number,
            'Customer deposit from ' || COALESCE(v_customer_name, 'Unknown'),
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            'DEPOSIT-' || NEW.id::TEXT
        );
        
        -- DR Cash
        v_line_number := 1;
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
            'Cash received - deposit ' || NEW.deposit_number,
            v_line_number,
            'CUSTOMER_DEPOSIT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- CR Customer Deposits (liability)
        v_line_number := 2;
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
            'Customer deposit liability - ' || NEW.deposit_number,
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
-- CRITICAL FIX: No EXCEPTION block - let errors propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 3. FIX DEPOSIT APPLICATION GL POSTING TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_post_deposit_application_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_deposit_account_id UUID;
    v_ar_account_id UUID;
    v_customer_name TEXT;
    v_deposit_number TEXT;
    v_line_number INTEGER := 0;
    v_existing_entry UUID;
BEGIN
    -- Only post on INSERT (new application)
    IF TG_OP = 'INSERT' THEN
        
        -- Check if already posted (idempotency)
        SELECT lt."Id" INTO v_existing_entry
        FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'DEPOSIT_APPLICATION' AND lt."ReferenceId" = NEW.id;
        
        IF v_existing_entry IS NOT NULL THEN
            RETURN NEW;
        END IF;
        
        -- Get deposit and customer info
        SELECT d.deposit_number, c.name 
        INTO v_deposit_number, v_customer_name
        FROM pos_customer_deposits d
        JOIN customers c ON c.id = d.customer_id
        WHERE d.id = NEW.deposit_id;
        
        -- Get GL account IDs
        SELECT "Id" INTO v_deposit_account_id FROM accounts WHERE "AccountCode" = '2200';
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        
        -- CRITICAL: Validate required accounts
        IF v_deposit_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: Customer Deposits account 2200 not found - cannot post deposit application';
        END IF;
        IF v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: AR account 1200 not found - cannot post deposit application';
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
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'DEPOSIT_APPLICATION',
            NEW.id,
            COALESCE(v_deposit_number, 'DEP-APP-' || NEW.id::TEXT),
            'Deposit applied: ' || COALESCE(v_deposit_number, '') || ' for ' || COALESCE(v_customer_name, 'Unknown'),
            NEW.amount_applied,
            NEW.amount_applied,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            'DEPOSIT-APP-' || NEW.id::TEXT
        );
        
        -- DR Customer Deposits (reduce liability)
        v_line_number := 1;
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
            'Deposit applied - ' || COALESCE(v_deposit_number, ''),
            v_line_number,
            'DEPOSIT_APPLICATION',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable (reduce AR)
        v_line_number := 2;
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
            NEW.amount_applied,
            0,
            NEW.amount_applied,
            'AR reduction via deposit - ' || COALESCE(v_deposit_number, ''),
            v_line_number,
            'DEPOSIT_APPLICATION',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update account balances
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - NEW.amount_applied, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_deposit_account_id;
        
        UPDATE accounts SET "CurrentBalance" = "CurrentBalance" - NEW.amount_applied, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_ar_account_id;
        
        RAISE NOTICE 'Posted deposit application (%) to ledger as % - DR Deposits, CR AR', NEW.amount_applied, v_transaction_number;
    END IF;
    
    RETURN NEW;
-- CRITICAL FIX: No EXCEPTION block - let errors propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. FIX INVOICE AR SYNC TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_sync_invoice_ar_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_old_outstanding NUMERIC(15,2);
    v_new_outstanding NUMERIC(15,2);
    v_balance_change NUMERIC(15,2);
BEGIN
    -- Calculate outstanding amounts
    v_old_outstanding := COALESCE(OLD."TotalAmount", 0) - COALESCE(OLD."PaidAmount", 0);
    v_new_outstanding := COALESCE(NEW."TotalAmount", 0) - COALESCE(NEW."PaidAmount", 0);
    v_balance_change := v_new_outstanding - v_old_outstanding;
    
    -- Update customer balance if there's a change
    IF v_balance_change != 0 AND NEW."CustomerId" IS NOT NULL THEN
        UPDATE customers 
        SET balance = balance + v_balance_change,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW."CustomerId";
        
        RAISE NOTICE 'Invoice % AR balance changed by %', NEW."InvoiceNumber", v_balance_change;
    END IF;
    
    -- Handle new invoices
    IF TG_OP = 'INSERT' AND NEW."CustomerId" IS NOT NULL THEN
        IF v_new_outstanding > 0 THEN
            UPDATE customers 
            SET balance = balance + v_new_outstanding,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW."CustomerId";
            
            RAISE NOTICE 'New invoice % added to AR: %', NEW."InvoiceNumber", v_new_outstanding;
        END IF;
    END IF;
    
    RETURN NEW;
-- CRITICAL FIX: No EXCEPTION block - let errors propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. FIX INVOICE PAYMENT SYNC TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_sync_invoice_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_ar_account_id UUID;
    v_existing_entry UUID;
BEGIN
    -- Only on new payments
    IF TG_OP = 'INSERT' THEN
        
        -- Check if already posted
        SELECT lt."Id" INTO v_existing_entry
        FROM ledger_transactions lt
        WHERE lt."ReferenceType" = 'INVOICE_PAYMENT' AND lt."ReferenceId" = NEW.id;
        
        IF v_existing_entry IS NOT NULL THEN
            RETURN NEW;
        END IF;
        
        -- Get invoice info
        SELECT i.*, c.name as customer_name
        INTO v_invoice
        FROM invoices i
        LEFT JOIN customers c ON c.id = i."CustomerId"
        WHERE i."Id" = NEW.invoice_id;
        
        IF v_invoice IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: Invoice not found for payment %', NEW.id;
        END IF;
        
        -- Get GL accounts
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        
        IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: GL accounts 1010 or 1200 not found for invoice payment';
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
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'INVOICE_PAYMENT',
            NEW.id,
            NEW.receipt_number,
            'Invoice payment: ' || COALESCE(v_invoice."InvoiceNumber", '') || ' from ' || COALESCE(v_invoice.customer_name, 'Unknown'),
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            'INV-PAY-' || NEW.id::TEXT
        );
        
        -- DR Cash
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_cash_account_id, 'DEBIT',
            NEW.amount, NEW.amount, 0, 'Cash received - ' || COALESCE(v_invoice."InvoiceNumber", ''),
            1, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'CREDIT',
            NEW.amount, 0, NEW.amount, 'AR reduction - ' || COALESCE(v_invoice."InvoiceNumber", ''),
            2, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Invoice payment % recorded: amount=%, receipt=%', 
            NEW.id, NEW.amount, NEW.receipt_number;
    END IF;
    
    RETURN NEW;
-- CRITICAL FIX: No EXCEPTION block - let errors propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'GL Trigger Exception Handling Fixed';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Fixed triggers now RAISE EXCEPTION on failure instead of swallowing:';
    RAISE NOTICE '  - fn_post_sale_to_ledger';
    RAISE NOTICE '  - fn_post_customer_deposit_to_ledger';
    RAISE NOTICE '  - fn_post_deposit_application_to_ledger';
    RAISE NOTICE '  - fn_sync_invoice_ar_balance';
    RAISE NOTICE '  - fn_sync_invoice_payment';
    RAISE NOTICE '';
    RAISE NOTICE 'This ensures atomic transactions: if GL fails, the business record fails too.';
    RAISE NOTICE '========================================';
END $$;
