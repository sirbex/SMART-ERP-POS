-- Migration: Fix payment_method enum comparison in invoice payment trigger functions
-- Issue: CASE statements comparing payment_method enum column against 'CHECK' string
--        PostgreSQL casts ALL WHEN branch constants to match the CASE expression type,
--        causing "invalid input value for enum payment_method: CHECK" even for valid
--        payment methods like MOBILE_MONEY, because 'CHECK' is not in the enum.
-- Fix: Cast payment_method to text before CASE comparison (::text)
-- Affected functions:
--   1. fn_post_invoice_payment_to_ledger (AFTER INSERT trigger on invoice_payments)
--   2. fn_post_invoice_payment_to_ledger_manual (manual GL posting function)
-- Date: 2026-03-02

-- ============================================================================
-- 1. fn_post_invoice_payment_to_ledger - AFTER INSERT trigger on invoice_payments
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_post_invoice_payment_to_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
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
        IF EXISTS (
            SELECT 1 FROM ledger_transactions
            WHERE ("ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = NEW.id)
               OR "IdempotencyKey" = v_idempotency_key
        ) THEN
            RAISE NOTICE 'Invoice payment % already posted to GL - skipping (idempotent)', NEW.receipt_number;
            RETURN NEW;
        END IF;

        -- Get invoice details and check if linked to a sale
        -- FIX: Cast s.payment_method to text to avoid enum comparison issues
        SELECT i."InvoiceNumber", s.payment_method::text
        INTO v_invoice_number, v_sale_payment_method
        FROM invoices i
        LEFT JOIN sales s ON s.id = i."SaleId"
        WHERE i."Id" = NEW.invoice_id;

        -- Check if invoice has AR debit entries
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
        -- FIX: Cast to text to prevent enum comparison errors with non-enum values like 'CHECK'
        CASE NEW.payment_method::text
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
END;
$function$;

-- ============================================================================
-- 2. fn_post_invoice_payment_to_ledger_manual - Manual GL posting function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fn_post_invoice_payment_to_ledger_manual(p_payment_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
    v_payment RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_ar_account_id UUID;
    v_invoice_number TEXT;
    v_line_number INTEGER := 0;
BEGIN
    -- Get payment details
    SELECT ip.*, i."InvoiceNumber"
    INTO v_payment
    FROM invoice_payments ip
    JOIN invoices i ON i."Id" = ip.invoice_id
    WHERE ip.id = p_payment_id;

    IF v_payment IS NULL THEN
        RAISE EXCEPTION 'Invoice payment % not found', p_payment_id;
    END IF;

    -- Skip if already posted
    IF EXISTS (SELECT 1 FROM ledger_transactions
               WHERE "ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = p_payment_id) THEN
        RAISE NOTICE 'Invoice payment % already posted', p_payment_id;
        RETURN;
    END IF;

    -- Get account IDs (cast to text to avoid enum comparison issues)
    CASE v_payment.payment_method::text
        WHEN 'CASH' THEN
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
        WHEN 'BANK_TRANSFER' THEN
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
        WHEN 'CHECK' THEN
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
        WHEN 'CARD' THEN
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
        ELSE
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
    END CASE;

    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';

    v_transaction_number := generate_ledger_transaction_number();
    v_transaction_id := gen_random_uuid();

    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
        "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
        "Status", "CreatedAt", "UpdatedAt", "IsReversed"
    ) VALUES (
        v_transaction_id,
        v_transaction_number,
        CURRENT_TIMESTAMP,
        'INVOICE_PAYMENT',
        v_payment.id,
        v_payment.receipt_number,
        'Invoice Payment: ' || v_payment.receipt_number || ' for ' || v_payment."InvoiceNumber",
        v_payment.amount,
        v_payment.amount,
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        FALSE
    );

    -- DR: Cash/Bank
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
        "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
        "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
    ) VALUES (
        gen_random_uuid(), v_transaction_id, v_transaction_id, v_debit_account_id, 'DEBIT',
        v_payment.amount, v_payment.amount, 0,
        'Payment received - ' || v_payment.receipt_number,
        1, 'INVOICE_PAYMENT', v_payment.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
    );

    -- CR: AR
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
        "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
        "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
    ) VALUES (
        gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'CREDIT',
        v_payment.amount, 0, v_payment.amount,
        'AR reduced - ' || v_payment.receipt_number,
        2, 'INVOICE_PAYMENT', v_payment.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
    );

    RAISE NOTICE 'Manually posted invoice payment % to GL', v_payment.receipt_number;
END;
$function$;
