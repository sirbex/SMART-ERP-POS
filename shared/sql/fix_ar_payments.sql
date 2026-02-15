-- COMPLETE AR REMEDIATION
-- Creates GL entries for invoice payments that are missing

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
    
    IF v_ar_account_id IS NULL THEN
        RAISE EXCEPTION 'AR account (1200) not found';
    END IF;
    IF v_cash_account_id IS NULL THEN
        RAISE EXCEPTION 'Cash account (1000) not found';
    END IF;
    
    -- Find invoice payments without GL entries
    FOR v_payment IN 
        SELECT ip.*, i."InvoiceNumber", i."CustomerName"
        FROM invoice_payments ip
        JOIN invoices i ON ip.invoice_id = i."Id"
        WHERE NOT EXISTS (
            SELECT 1 FROM ledger_entries le 
            WHERE le."EntityType" = 'INVOICE_PAYMENT' 
              AND le."EntityId" = ip.id::TEXT
        )
    LOOP
        RAISE NOTICE 'Creating GL entries for payment % (amount: %)', v_payment.receipt_number, v_payment.amount;
        
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
            'Invoice Payment: ' || v_payment.receipt_number || ' for ' || v_payment."InvoiceNumber" || ' (Remediation)',
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
            'Cash received - ' || v_payment.receipt_number || ' (Remediation)',
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
            'AR reduced - ' || v_payment.receipt_number || ' (Remediation)',
            v_line_number, 'INVOICE_PAYMENT', v_payment.id::TEXT, v_payment.payment_date, 0, CURRENT_TIMESTAMP
        );
        
        v_count := v_count + 1;
    END LOOP;
    
    RAISE NOTICE 'Created GL entries for % invoice payments', v_count;
END $$;

-- Now recalculate account balances from ledger entries
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

-- Show final AR reconciliation
SELECT 
    'AR Reconciliation' as check_name,
    (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '1200')::numeric(15,2) as gl_ar_balance,
    (SELECT COALESCE(SUM(balance), 0) FROM customers)::numeric(15,2) as customer_subledger,
    (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM invoices 
     WHERE "Status" NOT IN ('Draft', 'Cancelled', 'Void'))::numeric(15,2) as invoice_outstanding,
    ((SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '1200') - 
     (SELECT COALESCE(SUM(balance), 0) FROM customers))::numeric(15,2) as difference;
