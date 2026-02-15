-- ============================================================================
-- DATE HANDLING FORENSIC REVIEW - FIXES
-- ============================================================================
-- Purpose: Fix date handling issues identified in forensic review
-- Date: December 29, 2025
--
-- ISSUES IDENTIFIED:
-- 1. 14 ledger_entries have EntryDate = '-infinity' (data corruption)
-- 2. GL triggers use CURRENT_TIMESTAMP for TransactionDate instead of 
--    the business date from the source transaction
-- 3. TIMESTAMP columns used where DATE should be used (causes off-by-one)
-- 4. Session timezone is Africa/Nairobi, not UTC as intended
--
-- ============================================================================

BEGIN;

-- ============================================================================
-- FIX 1: Repair -infinity EntryDate values
-- ============================================================================
-- Copy TransactionDate from ledger_transactions to fix corrupted EntryDate

UPDATE ledger_entries le
SET "EntryDate" = lt."TransactionDate"
FROM ledger_transactions lt
WHERE le."TransactionId" = lt."Id"
AND le."EntryDate" = '-infinity';

DO $$
DECLARE
    v_fixed_count INT;
BEGIN
    GET DIAGNOSTICS v_fixed_count = ROW_COUNT;
    RAISE NOTICE 'Fixed % entries with -infinity EntryDate', v_fixed_count;
END $$;

-- ============================================================================
-- FIX 2: Update fn_post_sale_to_ledger to use sale_date, not CURRENT_TIMESTAMP
-- ============================================================================
-- The GL transaction date should match the BUSINESS date of the sale

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
    v_is_deposit_sale BOOLEAN := FALSE;
    v_existing_transaction UUID;
    v_transaction_date TIMESTAMPTZ;  -- Use the sale's business date
BEGIN
    -- Only trigger on status change to COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        
        -- IDEMPOTENCY CHECK: Verify no GL transaction already exists for this sale
        SELECT "Id" INTO v_existing_transaction
        FROM ledger_transactions
        WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id
        LIMIT 1;
        
        IF v_existing_transaction IS NOT NULL THEN
            RAISE NOTICE 'Sale % already posted to GL as %, skipping duplicate', 
                NEW.sale_number, v_existing_transaction;
            RETURN NEW;
        END IF;
        
        -- CRITICAL: Use the BUSINESS DATE from the sale, not CURRENT_TIMESTAMP
        -- This ensures GL entries match the sale's accounting period
        v_transaction_date := NEW.sale_date::TIMESTAMP AT TIME ZONE 'UTC';
        
        -- Get account IDs from Chart of Accounts
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_credit_card_account_id FROM accounts WHERE "AccountCode" = '1020';
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
        SELECT "Id" INTO v_cogs_account_id FROM accounts WHERE "AccountCode" = '5000';
        SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
        
        -- Check if this is a DEPOSIT sale
        v_is_deposit_sale := (NEW.payment_method::TEXT = 'DEPOSIT');
        
        -- Determine debit account based on payment method
        IF v_is_deposit_sale THEN
            v_debit_account_id := NULL;
            RAISE NOTICE 'DEPOSIT sale % - skipping asset debit', NEW.sale_number;
        ELSE
            CASE NEW.payment_method::TEXT
                WHEN 'CASH' THEN v_debit_account_id := v_cash_account_id;
                WHEN 'CARD' THEN v_debit_account_id := v_credit_card_account_id;
                WHEN 'CREDIT' THEN v_debit_account_id := v_ar_account_id;
                WHEN 'MOBILE_MONEY' THEN v_debit_account_id := v_cash_account_id;
                ELSE v_debit_account_id := v_cash_account_id;
            END CASE;
        END IF;
        
        -- Generate transaction number
        v_transaction_number := COALESCE(
            (SELECT generate_ledger_transaction_number()),
            'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
            LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                  FROM ledger_transactions)::TEXT, 6, '0')
        );
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction using BUSINESS DATE
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            v_transaction_date,  -- Use business date, NOT CURRENT_TIMESTAMP
            'SALE',
            NEW.id,
            NEW.sale_number,
            'Sale: ' || NEW.sale_number,
            COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
            COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
            'POSTED',
            CURRENT_TIMESTAMP,  -- CreatedAt is when the record was created (audit)
            CURRENT_TIMESTAMP,
            FALSE,
            'SALE:' || NEW.id::TEXT
        );
        
        -- Entry 1: DR Cash/Card/AR (amount received) - SKIP FOR DEPOSIT SALES
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
                'Sale payment - ' || NEW.sale_number,
                v_line_number,
                'SALE',
                NEW.id::TEXT,
                v_transaction_date,  -- Use business date
                0,
                CURRENT_TIMESTAMP
            );
        END IF;
        
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
            v_transaction_date,  -- Use business date
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Entry 3: DR COGS (if there's cost)
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
                NEW.total_cost,
                NEW.total_cost,
                0,
                'Cost of goods sold - ' || NEW.sale_number,
                v_line_number,
                'SALE',
                NEW.id::TEXT,
                v_transaction_date,  -- Use business date
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
                NEW.total_cost,
                0,
                NEW.total_cost,
                'Inventory reduction - ' || NEW.sale_number,
                v_line_number,
                'SALE',
                NEW.id::TEXT,
                v_transaction_date,  -- Use business date
                0,
                CURRENT_TIMESTAMP
            );
        END IF;
        
        RAISE NOTICE 'Posted sale % to ledger as % (date: %, payment: %)', 
            NEW.sale_number, v_transaction_number, NEW.sale_date, NEW.payment_method;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FIX 3: Repair existing GL entries to use correct business dates
-- ============================================================================
-- Update ledger_transactions.TransactionDate to match the source document date

-- Fix SALE transactions
UPDATE ledger_transactions lt
SET "TransactionDate" = s.sale_date::TIMESTAMP AT TIME ZONE 'UTC'
FROM sales s
WHERE lt."ReferenceType" = 'SALE'
AND lt."ReferenceId" = s.id
AND DATE(lt."TransactionDate") != s.sale_date;

-- Fix ledger_entries.EntryDate to match their transaction
UPDATE ledger_entries le
SET "EntryDate" = lt."TransactionDate"
FROM ledger_transactions lt
WHERE le."TransactionId" = lt."Id"
AND le."EntryDate" != lt."TransactionDate";

-- ============================================================================
-- FIX 4: Update goods receipt trigger to use received_date
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_post_goods_receipt_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_inventory_account_id UUID;
    v_ap_account_id UUID;
    v_existing_transaction UUID;
    v_transaction_date TIMESTAMPTZ;
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
        -- IDEMPOTENCY CHECK
        SELECT "Id" INTO v_existing_transaction
        FROM ledger_transactions
        WHERE "ReferenceType" = 'GOODS_RECEIPT' AND "ReferenceId" = NEW.id
        LIMIT 1;
        
        IF v_existing_transaction IS NOT NULL THEN
            RAISE NOTICE 'GR % already posted to GL, skipping', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- Use the GR's received_date as the business date
        v_transaction_date := COALESCE(NEW.received_date, CURRENT_TIMESTAMP);
        
        -- Get account IDs
        SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';
        
        IF v_inventory_account_id IS NULL OR v_ap_account_id IS NULL THEN
            RAISE EXCEPTION 'GL accounts not found for GR posting';
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
            v_transaction_date,  -- Use business date
            'GOODS_RECEIPT',
            NEW.id,
            NEW.receipt_number,
            'Goods Receipt: ' || NEW.receipt_number,
            NEW.total_value,
            NEW.total_value,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            'GOODS_RECEIPT:' || NEW.id::TEXT
        );
        
        -- DR Inventory
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_inventory_account_id, 'DEBIT',
            NEW.total_value, NEW.total_value, 0,
            'Inventory received - ' || NEW.receipt_number,
            1, 'GOODS_RECEIPT', NEW.id::TEXT, v_transaction_date, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Payable
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ap_account_id, 'CREDIT',
            NEW.total_value, 0, NEW.total_value,
            'Accounts payable - ' || NEW.receipt_number,
            2, 'GOODS_RECEIPT', NEW.id::TEXT, v_transaction_date, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted GR % to ledger as % (date: %)', 
            NEW.receipt_number, v_transaction_number, v_transaction_date;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

SELECT '================================================================' as header;
SELECT '     DATE HANDLING FIXES - VERIFICATION' as title;
SELECT '================================================================' as header;

-- 1. Check for remaining -infinity dates
SELECT '' as blank;
SELECT '1. LEDGER_ENTRIES WITH -INFINITY DATES' as check;
SELECT '-----------------------------------------' as sep;

SELECT COUNT(*) as remaining_infinity_dates
FROM ledger_entries
WHERE "EntryDate" = '-infinity';

-- 2. Sales vs GL date matching
SELECT '' as blank;
SELECT '2. SALES vs GL DATE MATCHING' as check;
SELECT '-------------------------------' as sep;

SELECT 
    s.sale_number,
    s.sale_date::text as sale_date,
    DATE(lt."TransactionDate")::text as gl_date,
    CASE WHEN s.sale_date = DATE(lt."TransactionDate") THEN '✓ MATCH' ELSE '✗ OFF' END as status
FROM sales s
JOIN ledger_transactions lt ON lt."ReferenceId" = s.id AND lt."ReferenceType" = 'SALE'
ORDER BY s.sale_date;

-- 3. Reconciliation by date
SELECT '' as blank;
SELECT '3. SALES vs GL RECONCILIATION BY DATE' as check;
SELECT '----------------------------------------' as sep;

WITH sales_by_date AS (
    SELECT 
        sale_date,
        SUM(total_amount) as revenue,
        SUM(total_cost) as cogs
    FROM sales WHERE status = 'COMPLETED'
    GROUP BY sale_date
),
gl_by_date AS (
    SELECT 
        DATE(lt."TransactionDate") as txn_date,
        SUM(CASE WHEN a."AccountCode" = '4000' THEN le."CreditAmount" ELSE 0 END) as revenue,
        SUM(CASE WHEN a."AccountCode" = '5000' THEN le."DebitAmount" ELSE 0 END) as cogs
    FROM ledger_entries le
    JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
    JOIN accounts a ON a."Id" = le."AccountId"
    WHERE lt."ReferenceType" = 'SALE'
    GROUP BY DATE(lt."TransactionDate")
)
SELECT 
    COALESCE(s.sale_date, g.txn_date) as date,
    s.revenue::numeric(15,2) as sales_revenue,
    g.revenue::numeric(15,2) as gl_revenue,
    CASE WHEN s.revenue = g.revenue THEN '✓' ELSE '✗' END as rev_match,
    s.cogs::numeric(15,2) as sales_cogs,
    g.cogs::numeric(15,2) as gl_cogs,
    CASE WHEN s.cogs = g.cogs THEN '✓' ELSE '✗' END as cogs_match
FROM sales_by_date s
FULL OUTER JOIN gl_by_date g ON s.sale_date = g.txn_date
ORDER BY date;
