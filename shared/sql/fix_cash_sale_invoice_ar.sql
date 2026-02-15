-- FIX FOR CASH SALE + INVOICE AR DISCREPANCY
-- 
-- Problem: When a CASH sale creates an invoice:
-- 1. Invoice trigger posts DR AR / CR Revenue
-- 2. Invoice payment trigger SKIPS GL (assumes sale trigger handled it)
-- 3. Sale trigger also SKIPS GL
-- Result: AR has a debit with no corresponding credit
--
-- Solution: Fix the invoice payment trigger to NOT skip CASH sales when an invoice exists

-- First, let's fix the existing discrepancy by creating the missing GL entries
DO $$
DECLARE
    v_payment RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ar_account_id UUID;
    v_cash_account_id UUID;
    v_line_number INTEGER;
    v_count INTEGER := 0;
BEGIN
    -- Get account IDs
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1000';
    IF v_cash_account_id IS NULL THEN
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    END IF;
    
    IF v_ar_account_id IS NULL THEN
        RAISE EXCEPTION 'AR account (1200) not found';
    END IF;
    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account (1000/1010) not found';
    END IF;
    
    -- Find invoice payments that:
    -- 1. Have no GL entries
    -- 2. Have an invoice with AR debit entries (meaning invoice was posted)
    FOR v_payment IN 
        SELECT 
            ip.*,
            i."InvoiceNumber",
            i."CustomerName"
        FROM invoice_payments ip
        JOIN invoices i ON ip.invoice_id = i."Id"
        WHERE NOT EXISTS (
            SELECT 1 FROM ledger_entries le 
            WHERE le."EntityId" = ip.id::TEXT
              AND le."EntityType" = 'INVOICE_PAYMENT'
        )
        AND EXISTS (
            SELECT 1 FROM ledger_entries le 
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE le."EntityId" = i."Id"::TEXT
              AND le."EntityType" = 'INVOICE'
              AND a."AccountCode" = '1200'
              AND le."DebitAmount" > 0
        )
    LOOP
        RAISE NOTICE 'Creating GL entries for payment % (amount: %) - Invoice: %', 
                     v_payment.receipt_number, v_payment.amount, v_payment."InvoiceNumber";
        
        v_line_number := 0;
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
            v_payment.payment_date,
            'INVOICE_PAYMENT',
            v_payment.id,
            v_payment.receipt_number,
            'Payment received: ' || v_payment.receipt_number || ' for ' || v_payment."InvoiceNumber",
            v_payment.amount,
            v_payment.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Cash (receive money)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_cash_account_id, 'DEBIT',
            v_payment.amount, v_payment.amount, 0, 
            'Cash received - ' || v_payment.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', v_payment.id::TEXT, v_payment.payment_date, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable (reduce AR)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'CREDIT',
            v_payment.amount, 0, v_payment.amount,
            'AR reduced - ' || v_payment.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', v_payment.id::TEXT, v_payment.payment_date, 0, CURRENT_TIMESTAMP
        );
        
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Created GL entries for % invoice payments', v_count;
END $$;

-- Now fix the trigger to NOT skip CASH sale invoice payments when invoice has AR entries
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
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Get invoice details and check if this is linked to a sale
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
        -- If invoice has AR entry, we MUST post the payment to clear it
        IF v_sale_payment_method = 'CASH' AND NOT v_invoice_has_ar_entry THEN
            RAISE NOTICE 'Invoice payment % for CASH sale without AR entry - skipping GL', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- IDEMPOTENCY CHECK: Skip if already posted
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Invoice payment % already posted to GL - skipping', NEW.receipt_number;
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
        
        -- Create ledger transaction
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
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
            FALSE
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
        
        RAISE NOTICE 'Posted invoice payment % to ledger as %', NEW.receipt_number, v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- NO EXCEPTION HANDLER - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- Recalculate account balances
UPDATE accounts 
SET "CurrentBalance" = sub.balance
FROM (
    SELECT 
        le."AccountId",
        SUM(le."DebitAmount") - SUM(le."CreditAmount") as balance
    FROM ledger_entries le
    GROUP BY le."AccountId"
) sub
WHERE accounts."Id" = sub."AccountId";

-- Verification
SELECT 
    'AR Reconciliation' as check_name,
    (SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount") 
     FROM ledger_entries le 
     JOIN accounts a ON a."Id" = le."AccountId" 
     WHERE a."AccountCode" = '1200')::numeric(15,2) as gl_ar_balance,
    (SELECT COALESCE(SUM(balance), 0) FROM customers)::numeric(15,2) as customer_subledger,
    (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM invoices 
     WHERE "Status" NOT IN ('Draft', 'Cancelled', 'Void'))::numeric(15,2) as invoice_outstanding;
