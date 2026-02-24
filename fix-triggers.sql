-- ============================================================
-- PERMANENT RECONCILIATION FIXES
-- Prevents future GL discrepancies in AR, AP, Inventory, Cash
-- Date: 2026-02-19
-- ============================================================

BEGIN;

-- ============================================================
-- FIX 1: Replace invoice payment GL trigger with IdempotencyKey
-- Problem: Trigger didn't set IdempotencyKey on ledger_transactions,
-- creating a gap where glEntryService could double-post.
-- Also: idempotency check only checked ReferenceType+ReferenceId,
-- not IdempotencyKey. Now checks BOTH.
-- Also: Added DEPOSIT payment method skip (deposit already posted).
-- ============================================================

CREATE OR REPLACE FUNCTION fn_post_invoice_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_ar_account_id UUID;
    v_invoice_number TEXT;
    v_sale_payment_method TEXT;
    v_invoice_has_ar_entry BOOLEAN;
    v_line_number INTEGER := 0;
    v_idempotency_key TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Build idempotency key FIRST (matches glEntryService pattern)
        v_idempotency_key := 'INVOICE_PAYMENT-' || NEW.id::TEXT;
        
        -- COMPREHENSIVE IDEMPOTENCY CHECK
        -- Checks both ReferenceType+ReferenceId AND IdempotencyKey
        -- This prevents double-posting from ANY source
        IF EXISTS (
            SELECT 1 FROM ledger_transactions 
            WHERE ("ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = NEW.id)
               OR "IdempotencyKey" = v_idempotency_key
        ) THEN
            RAISE NOTICE 'Invoice payment % already posted to GL - skipping (idempotent)', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- Get invoice details and check if linked to a sale
        SELECT i."InvoiceNumber", s.payment_method 
        INTO v_invoice_number, v_sale_payment_method
        FROM invoices i 
        LEFT JOIN sales s ON s.id = i."SaleId"
        WHERE i."Id" = NEW.invoice_id;
        
        -- Check if invoice has AR debit entries (meaning invoice was posted to AR)
        SELECT EXISTS (
            SELECT 1 FROM ledger_entries le 
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE le."EntityId" = NEW.invoice_id::TEXT
              AND le."EntityType" = 'INVOICE'
              AND a."AccountCode" = '1200'
              AND le."DebitAmount" > 0
        ) INTO v_invoice_has_ar_entry;
        
        -- FIXED: Only skip if CASH sale AND invoice does NOT have AR entry
        IF v_sale_payment_method = 'CASH' AND NOT v_invoice_has_ar_entry THEN
            RAISE NOTICE 'Invoice payment % for CASH sale without AR entry - skipping GL', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- DEPOSIT payments: money already received via deposit, no Cash DR needed
        IF NEW.payment_method = 'DEPOSIT' THEN
            RAISE NOTICE 'Invoice payment % via DEPOSIT - skipping GL (deposit already posted)', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- Get account IDs based on payment method
        CASE NEW.payment_method
            WHEN 'CASH' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
                IF v_debit_account_id IS NULL THEN
                    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1000';
                END IF;
            WHEN 'BANK_TRANSFER' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
            WHEN 'CHECK' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
            WHEN 'CARD' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
            WHEN 'MOBILE_MONEY' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
                IF v_debit_account_id IS NULL THEN
                    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1000';
                END IF;
            ELSE 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
                IF v_debit_account_id IS NULL THEN
                    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1000';
                END IF;
        END CASE;
        
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        
        IF v_debit_account_id IS NULL THEN
            RAISE EXCEPTION 'Cash/Bank account not found for invoice payment GL posting';
        END IF;
        
        IF v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'AR account (1200) not found for invoice payment GL posting';
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                 LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                       FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction WITH IdempotencyKey
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
            'Invoice Payment: ' || NEW.receipt_number || ' for ' || v_invoice_number,
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            v_idempotency_key
        );
        
        -- DR Cash/Bank
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_debit_account_id, 'DEBIT',
            NEW.amount, NEW.amount, 0,
            'Cash received - ' || NEW.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'CREDIT',
            NEW.amount, 0, NEW.amount,
            'AR reduced - ' || NEW.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted invoice payment % to ledger as % (key: %)', NEW.receipt_number, v_transaction_number, v_idempotency_key;
    END IF;
    
    RETURN NEW;
    -- NO EXCEPTION HANDLER - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- FIX 2: Add IdempotencyKey to supplier payment GL trigger
-- Same problem as invoice payments - no IdempotencyKey.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_post_supplier_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_credit_account_id UUID;
    v_credit_account_code TEXT;
    v_ap_account_id UUID;
    v_supplier_name TEXT;
    v_idempotency_key TEXT;
BEGIN
    -- Build idempotency key FIRST
    v_idempotency_key := 'SUPPLIER_PAYMENT-' || NEW."Id"::TEXT;
    
    -- COMPREHENSIVE IDEMPOTENCY CHECK
    IF EXISTS (
        SELECT 1 FROM ledger_transactions 
        WHERE ("ReferenceType" = 'SUPPLIER_PAYMENT' AND "ReferenceId" = NEW."Id")
           OR "IdempotencyKey" = v_idempotency_key
    ) THEN
        RAISE NOTICE 'Supplier payment % already posted to GL - skipping (idempotent)', NEW."PaymentNumber";
        RETURN NEW;
    END IF;

    -- Get A/P account ID
    SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';
    
    -- Determine credit account based on payment method
    CASE UPPER(COALESCE(NEW."PaymentMethod", 'CASH'))
        WHEN 'CASH' THEN
            v_credit_account_code := '1010';
        WHEN 'BANK_TRANSFER' THEN
            v_credit_account_code := '1030';
        WHEN 'CHECK' THEN
            v_credit_account_code := '1030';
        WHEN 'CARD' THEN
            v_credit_account_code := '1030';
        ELSE
            v_credit_account_code := '1010';
    END CASE;
    
    SELECT "Id" INTO v_credit_account_id FROM accounts WHERE "AccountCode" = v_credit_account_code;
    
    IF v_credit_account_id IS NULL THEN
        SELECT "Id" INTO v_credit_account_id FROM accounts WHERE "AccountCode" = '1010';
        v_credit_account_code := '1010';
    END IF;
    
    SELECT "CompanyName" INTO v_supplier_name FROM suppliers WHERE "Id" = NEW."SupplierId";
    
    IF COALESCE(NEW."Amount", 0) > 0 THEN
        v_transaction_number := generate_ledger_transaction_number();
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction WITH IdempotencyKey
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
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
            FALSE,
            v_idempotency_key
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
        
        -- CR Cash/Bank
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
            'Bank/Cash paid - ' || COALESCE(v_supplier_name, 'Unknown'),
            2,
            'SUPPLIER_PAYMENT',
            NEW."Id"::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted supplier payment % to GL as % (key: %)', NEW."PaymentNumber", v_transaction_number, v_idempotency_key;
    END IF;
    
    RETURN NEW;
    -- NO EXCEPTION HANDLER - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- FIX 3: Unify fn_recalculate_supplier_ap_balance
-- Problem: Two overloaded functions with DIFFERENT calculation methods
-- One uses SUM(OutstandingBalance) from supplier_invoices
-- Other uses SUM(GR cost) - SUM(payments)
-- Fix: Use ONLY the authoritative allocation-based method
-- supplier_invoices.OutstandingBalance is the source of truth since
-- fn_sync_supplier_payment_allocation already maintains it correctly
-- ============================================================

-- Drop the non-trigger version first (the one that takes UUID param)
DROP FUNCTION IF EXISTS fn_recalculate_supplier_ap_balance(UUID);

-- Recreate as a single authoritative function
CREATE OR REPLACE FUNCTION fn_recalculate_supplier_ap_balance(p_supplier_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_outstanding NUMERIC;
BEGIN
    -- SINGLE SOURCE OF TRUTH: Sum outstanding from supplier invoices
    -- supplier_invoices.OutstandingBalance is authoritatively maintained 
    -- by fn_sync_supplier_payment_allocation trigger
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_total_outstanding
    FROM supplier_invoices
    WHERE "SupplierId" = p_supplier_id
      AND "Status" NOT IN ('Cancelled', 'Voided')
      AND deleted_at IS NULL;

    UPDATE suppliers
    SET "OutstandingBalance" = v_total_outstanding,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;

    RAISE NOTICE 'Updated supplier % AP balance to %', p_supplier_id, v_total_outstanding;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- FIX 4: Replace fn_sync_supplier_balance_on_payment trigger function
-- to use the unified fn_recalculate_supplier_ap_balance
-- instead of fn_update_supplier_balance_internal
-- ============================================================

-- Drop the conflicting trigger that uses the wrong calculation
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_on_payment ON supplier_payments;

-- The remaining trigger trg_sync_supplier_on_payment already calls
-- fn_recalculate_supplier_ap_balance correctly


-- ============================================================
-- FIX 5: Add UNIQUE CONSTRAINT on IdempotencyKey (if not exists)
-- This is the ultimate guard: even if code fails to check,
-- the database will reject duplicate GL postings.
-- ============================================================

-- Add unique index on IdempotencyKey (allows NULLs - multiple NULL values are ok)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transactions_idempotency_key 
ON ledger_transactions ("IdempotencyKey") 
WHERE "IdempotencyKey" IS NOT NULL;

-- Also add a unique index on ReferenceType + ReferenceId for triggers
CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_transactions_reference_unique
ON ledger_transactions ("ReferenceType", "ReferenceId")
WHERE "ReferenceId" IS NOT NULL AND "Status" = 'POSTED';


-- ============================================================
-- FIX 6: Add GL balance assertion trigger
-- Fires AFTER INSERT on ledger_entries to verify DR = CR
-- for the parent transaction. Prevents imbalanced entries.
-- ============================================================

CREATE OR REPLACE FUNCTION fn_assert_gl_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_total_dr NUMERIC;
    v_total_cr NUMERIC;
    v_txn_number TEXT;
BEGIN
    -- Check if the parent transaction is balanced
    SELECT SUM("DebitAmount"), SUM("CreditAmount")
    INTO v_total_dr, v_total_cr
    FROM ledger_entries
    WHERE "TransactionId" = NEW."TransactionId";
    
    SELECT "TransactionNumber" INTO v_txn_number
    FROM ledger_transactions WHERE "Id" = NEW."TransactionId";
    
    -- Allow small rounding tolerance (0.01)
    IF ABS(COALESCE(v_total_dr, 0) - COALESCE(v_total_cr, 0)) > 0.01 THEN
        RAISE EXCEPTION 'GL BALANCE VIOLATION: Transaction % has DR=% CR=% (diff=%). All GL entries MUST balance.',
            v_txn_number, v_total_dr, v_total_cr, v_total_dr - v_total_cr;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_assert_gl_balance') THEN
        CREATE CONSTRAINT TRIGGER trg_assert_gl_balance
        AFTER INSERT ON ledger_entries
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW
        EXECUTE FUNCTION fn_assert_gl_balance();
    END IF;
END;
$$;


COMMIT;

SELECT 'All permanent reconciliation fixes applied successfully' as result;
