-- FIX FOR AR DISCREPANCY: Invoice GL Posting Trigger
-- Issue: GL entries not posted when invoice status changes from 'Draft' to 'PartiallyPaid' or 'Paid'
-- The trigger only fired on 'Issued'/'Sent' status, but the payment sync changes status directly to 'PartiallyPaid'/'Paid'

-- Fix: Update the trigger to post GL entries when invoice goes from Draft to ANY active status

CREATE OR REPLACE FUNCTION fn_post_customer_invoice_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_line_number INTEGER := 0;
    v_already_posted BOOLEAN := FALSE;
BEGIN
    -- Check if GL entry already exists for this invoice (prevent duplicate posting)
    SELECT EXISTS (
        SELECT 1 FROM ledger_entries 
        WHERE "EntityType" = 'INVOICE' 
          AND "EntityId" = NEW."Id"::TEXT
          AND "EntryType" = 'DEBIT'
    ) INTO v_already_posted;
    
    IF v_already_posted THEN
        RAISE NOTICE 'Invoice % already has GL entries, skipping', NEW."InvoiceNumber";
        RETURN NEW;
    END IF;
    
    -- FIXED: Trigger on ANY status change from 'Draft' to an active status
    -- Active statuses: 'Issued', 'Sent', 'Unpaid', 'PartiallyPaid', 'Paid', 'Overdue'
    IF NEW."Status" NOT IN ('Draft', 'Cancelled', 'Void') AND 
       (OLD."Status" IS NULL OR OLD."Status" = 'Draft') THEN
        
        -- Get account IDs
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
        
        IF v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'AR account (1200) not found - cannot post invoice GL entry';
        END IF;
        
        IF v_revenue_account_id IS NULL THEN
            -- Try alternative revenue accounts
            SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4100';
            IF v_revenue_account_id IS NULL THEN
                RAISE EXCEPTION 'Revenue account (4000 or 4100) not found - cannot post invoice GL entry';
            END IF;
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
            'INVOICE',
            NEW."Id",
            NEW."InvoiceNumber",
            'Customer Invoice: ' || NEW."InvoiceNumber",
            NEW."TotalAmount",
            NEW."TotalAmount",
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Accounts Receivable (for full invoice amount - not amount paid)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'DEBIT',
            NEW."TotalAmount", NEW."TotalAmount", 0, 
            'Invoice ' || NEW."InvoiceNumber" || ' - ' || NEW."CustomerName",
            v_line_number, 'INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Revenue (for full invoice amount)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_revenue_account_id, 'CREDIT',
            NEW."TotalAmount", 0, NEW."TotalAmount",
            'Revenue - Invoice ' || NEW."InvoiceNumber",
            v_line_number, 'INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- Update account balances
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE("CurrentBalance", 0) + NEW."TotalAmount"
        WHERE "Id" = v_ar_account_id;
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE("CurrentBalance", 0) + NEW."TotalAmount"
        WHERE "Id" = v_revenue_account_id;
        
        RAISE NOTICE 'Posted customer invoice % to ledger as % (status: %)', 
                     NEW."InvoiceNumber", v_transaction_number, NEW."Status";
    END IF;
    
    RETURN NEW;
    -- NO EXCEPTION HANDLER - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- Also need to fix existing data - create GL entries for invoices that were missed
-- This is a one-time remediation script

DO $$
DECLARE
    v_invoice RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_line_number INTEGER;
    v_count INTEGER := 0;
BEGIN
    -- Get account IDs
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
    IF v_revenue_account_id IS NULL THEN
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4100';
    END IF;
    
    IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Required GL accounts not found';
    END IF;
    
    -- Find invoices without GL entries
    FOR v_invoice IN 
        SELECT i.* FROM invoices i
        WHERE i."Status" NOT IN ('Draft', 'Cancelled', 'Void')
          AND NOT EXISTS (
              SELECT 1 FROM ledger_entries le 
              WHERE le."EntityType" = 'INVOICE' 
                AND le."EntityId" = i."Id"::TEXT
          )
    LOOP
        RAISE NOTICE 'Creating GL entries for invoice %', v_invoice."InvoiceNumber";
        
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
            v_invoice."InvoiceDate",
            'INVOICE',
            v_invoice."Id",
            v_invoice."InvoiceNumber",
            'Customer Invoice: ' || v_invoice."InvoiceNumber" || ' (Remediation)',
            v_invoice."TotalAmount",
            v_invoice."TotalAmount",
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Accounts Receivable
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'DEBIT',
            v_invoice."TotalAmount", v_invoice."TotalAmount", 0, 
            'Invoice ' || v_invoice."InvoiceNumber" || ' - ' || v_invoice."CustomerName" || ' (Remediation)',
            v_line_number, 'INVOICE', v_invoice."Id"::TEXT, v_invoice."InvoiceDate", 0, CURRENT_TIMESTAMP
        );
        
        -- CR Revenue
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_revenue_account_id, 'CREDIT',
            v_invoice."TotalAmount", 0, v_invoice."TotalAmount",
            'Revenue - Invoice ' || v_invoice."InvoiceNumber" || ' (Remediation)',
            v_line_number, 'INVOICE', v_invoice."Id"::TEXT, v_invoice."InvoiceDate", 0, CURRENT_TIMESTAMP
        );
        
        v_count := v_count + 1;
    END LOOP;
    
    -- Update account balances based on ledger entries
    UPDATE accounts a
    SET "CurrentBalance" = (
        SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
        FROM ledger_entries le
        WHERE le."AccountId" = a."Id"
    )
    WHERE a."AccountCode" = '1200';
    
    RAISE NOTICE 'Remediation complete: Created GL entries for % invoices', v_count;
END $$;

-- Verify the fix
SELECT 
    'AR Balance Check' as check_type,
    (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '1200') as gl_ar_balance,
    (SELECT SUM(balance) FROM customers) as customer_subledger,
    (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '1200') - 
    (SELECT COALESCE(SUM(balance), 0) FROM customers) as difference;
