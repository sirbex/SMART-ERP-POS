-- ============================================================================
-- MIGRATION 251: Diagnose and Repair GL Duplicate/Missing Entries
--
-- Run AFTER 250_disable_gl_posting_triggers.sql
--
-- This migration:
--   1. Identifies duplicate GL entries (from dual trigger+application posting)
--   2. Identifies missing GL entries (from silent failure swallowing)
--   3. Reverses duplicate entries (preserving audit trail)
--   4. Recalculates account balances from ledger_entries
--
-- Date: 2026-03-25
-- ============================================================================

-- ============================================================================
-- STEP 1: DIAGNOSTIC — Find duplicate GL entries
-- Duplicates occur when both a trigger and application code posted the same
-- transaction. They share the same ReferenceType+ReferenceId but have
-- different transaction IDs.
-- ============================================================================

-- 1a. Find duplicate ledger_transactions by ReferenceType + ReferenceId
CREATE TEMP TABLE _duplicate_gl_transactions AS
SELECT
    lt."ReferenceType",
    lt."ReferenceId",
    COUNT(*) AS entry_count,
    array_agg(lt."Id" ORDER BY lt."CreatedAt") AS transaction_ids,
    array_agg(lt."IdempotencyKey" ORDER BY lt."CreatedAt") AS idempotency_keys,
    array_agg(lt."CreatedAt" ORDER BY lt."CreatedAt") AS created_dates
FROM ledger_transactions lt
WHERE lt."Status" = 'POSTED'
  AND lt."ReferenceType" IS NOT NULL
  AND lt."ReferenceId" IS NOT NULL
GROUP BY lt."ReferenceType", lt."ReferenceId"
HAVING COUNT(*) > 1;

-- Show diagnostic results
SELECT 
    'DUPLICATE GL ENTRIES' AS check_name,
    COUNT(*) AS affected_transactions,
    SUM(entry_count - 1) AS entries_to_reverse,
    COALESCE(string_agg(DISTINCT "ReferenceType", ', '), 'none') AS affected_types
FROM _duplicate_gl_transactions;

-- 1b. Detail of each duplicate
SELECT 
    "ReferenceType",
    "ReferenceId",
    entry_count,
    idempotency_keys,
    created_dates
FROM _duplicate_gl_transactions
ORDER BY "ReferenceType", created_dates[1];

-- ============================================================================
-- STEP 2: DIAGNOSTIC — Find missing GL entries for completed transactions
-- Missing entries occur when GL posting failed silently (error swallowed)
-- ============================================================================

-- 2a. Completed Goods Receipts without GL entries
SELECT 
    'MISSING GR GL ENTRIES' AS check_name,
    COUNT(*) AS missing_count
FROM goods_receipts gr
WHERE gr.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt
    WHERE lt."ReferenceType" = 'GOODS_RECEIPT'
      AND lt."ReferenceId" = gr.id::text
      AND lt."Status" = 'POSTED'
  );

-- 2b. Completed Supplier Payments without GL entries
SELECT 
    'MISSING SUPPLIER PAYMENT GL' AS check_name,
    COUNT(*) AS missing_count
FROM supplier_payments sp
WHERE sp.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt
    WHERE lt."ReferenceType" = 'SUPPLIER_PAYMENT'
      AND lt."ReferenceId" = sp.id::text
      AND lt."Status" = 'POSTED'
  );

-- 2c. Completed Sales without GL entries
SELECT 
    'MISSING SALE GL ENTRIES' AS check_name,
    COUNT(*) AS missing_count
FROM sales s
WHERE s.status = 'COMPLETED'
  AND NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt
    WHERE lt."ReferenceType" = 'SALE'
      AND lt."ReferenceId" = s.id::text
      AND lt."Status" = 'POSTED'
  );

-- 2d. Invoice Payments without GL entries
SELECT 
    'MISSING INVOICE PAYMENT GL' AS check_name,
    COUNT(*) AS missing_count
FROM invoice_payments ip
WHERE NOT EXISTS (
    SELECT 1 FROM ledger_transactions lt
    WHERE lt."ReferenceType" = 'INVOICE_PAYMENT'
      AND lt."ReferenceId" = ip.id::text
      AND lt."Status" = 'POSTED'
  );

-- ============================================================================
-- STEP 3: DIAGNOSTIC — Current inventory discrepancy amount
-- ============================================================================

SELECT 
    'INVENTORY DISCREPANCY' AS check_name,
    gl_balance,
    batch_valuation,
    (gl_balance - batch_valuation) AS difference,
    CASE WHEN ABS(gl_balance - batch_valuation) < 0.01 
         THEN 'MATCHED' 
         ELSE 'DISCREPANCY' 
    END AS status
FROM (
    SELECT
        COALESCE((
            SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
            JOIN accounts a ON le."AccountId" = a."Id"
            WHERE a."AccountCode" = '1300'
              AND lt."Status" = 'POSTED'
        ), 0) AS gl_balance,
        COALESCE((
            SELECT SUM(remaining_quantity * cost_price)
            FROM inventory_batches
            WHERE remaining_quantity > 0
        ), 0) AS batch_valuation
) sub;

-- ============================================================================
-- STEP 4: REPAIR — Reverse duplicate GL entries
-- For each set of duplicates, keep the FIRST entry (earliest CreatedAt)
-- and create reversing entries for all subsequent duplicates.
-- ============================================================================

BEGIN;

-- Create reversing entries for duplicate transactions
-- Keep the first (oldest) entry, reverse all others
DO $$
DECLARE
    rec RECORD;
    dup_txn_id UUID;
    dup_ids UUID[];
    rev_txn_id UUID;
    rev_txn_number TEXT;
    entry_rec RECORD;
    i INT;
BEGIN
    FOR rec IN 
        SELECT * FROM _duplicate_gl_transactions
    LOOP
        -- Skip the first entry (keep it), reverse entries 2..N
        dup_ids := rec.transaction_ids;
        
        FOR i IN 2..array_length(dup_ids, 1)
        LOOP
            dup_txn_id := dup_ids[i];
            rev_txn_id := gen_random_uuid();
            
            -- Generate unique reversal transaction number
            SELECT 'REV-DUP-' || LPAD(
                (COALESCE(
                    (SELECT MAX(CAST(SUBSTRING("TransactionNumber" FROM 'REV-DUP-(\d+)') AS INT))
                     FROM ledger_transactions 
                     WHERE "TransactionNumber" LIKE 'REV-DUP-%'), 0
                ) + 1)::TEXT, 6, '0')
            INTO rev_txn_number;
            
            -- Create reversing transaction header
            INSERT INTO ledger_transactions (
                "Id", "TransactionNumber", "TransactionDate", "Description",
                "ReferenceType", "ReferenceId", "ReferenceNumber",
                "TotalDebitAmount", "TotalCreditAmount", "Status",
                "IdempotencyKey", "ReversesTransactionId", "CreatedAt"
            )
            SELECT
                rev_txn_id,
                rev_txn_number,
                NOW(),
                'REVERSAL: Duplicate GL entry from dual trigger+application posting',
                'REVERSAL',
                dup_txn_id::TEXT,
                rev_txn_number,
                "TotalDebitAmount",
                "TotalCreditAmount",
                'POSTED',
                'REV-DUP-' || dup_txn_id::TEXT,
                dup_txn_id,
                NOW()
            FROM ledger_transactions WHERE "Id" = dup_txn_id;
            
            -- Create reversing entries (swap debits and credits)
            FOR entry_rec IN
                SELECT * FROM ledger_entries WHERE "TransactionId" = dup_txn_id
            LOOP
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "AccountId",
                    "DebitAmount", "CreditAmount", "Description",
                    "EntityType", "EntityId"
                ) VALUES (
                    gen_random_uuid(),
                    rev_txn_id,
                    entry_rec."AccountId",
                    entry_rec."CreditAmount",  -- Swap: original credit becomes debit
                    entry_rec."DebitAmount",    -- Swap: original debit becomes credit
                    'REVERSAL: ' || COALESCE(entry_rec."Description", ''),
                    entry_rec."EntityType",
                    entry_rec."EntityId"
                );
            END LOOP;
            
            -- Mark the original duplicate as REVERSED
            UPDATE ledger_transactions
            SET "Status" = 'REVERSED',
                "ReversedByTransactionId" = rev_txn_id,
                "ReversedAt" = NOW()
            WHERE "Id" = dup_txn_id;
            
            RAISE NOTICE 'Reversed duplicate transaction: % (type: %, ref: %)', 
                dup_txn_id, rec."ReferenceType", rec."ReferenceId";
        END LOOP;
    END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- STEP 5: Recalculate account balances from ledger_entries
-- The trg_sync_account_balance_on_ledger trigger handles this per-entry,
-- but after bulk reversals we should verify all accounts are correct.
-- ============================================================================

BEGIN;

UPDATE accounts a
SET "CurrentBalance" = sub.calculated_balance
FROM (
    SELECT 
        a2."Id",
        CASE 
            WHEN a2."NormalBalance" = 'DEBIT' THEN
                COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0)
            ELSE
                COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0)
        END AS calculated_balance
    FROM accounts a2
    LEFT JOIN ledger_entries le ON le."AccountId" = a2."Id"
    LEFT JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        AND lt."Status" = 'POSTED'
    GROUP BY a2."Id", a2."NormalBalance"
) sub
WHERE a."Id" = sub."Id"
  AND a."CurrentBalance" IS DISTINCT FROM sub.calculated_balance;

COMMIT;

-- ============================================================================
-- STEP 6: Post-repair verification
-- ============================================================================

-- Verify no more duplicates
SELECT 
    'POST-REPAIR: Remaining duplicates' AS check_name,
    COUNT(*) AS count
FROM (
    SELECT lt."ReferenceType", lt."ReferenceId"
    FROM ledger_transactions lt
    WHERE lt."Status" = 'POSTED'
      AND lt."ReferenceType" IS NOT NULL
      AND lt."ReferenceId" IS NOT NULL
    GROUP BY lt."ReferenceType", lt."ReferenceId"
    HAVING COUNT(*) > 1
) sub;

-- Verify inventory discrepancy resolved
SELECT 
    'POST-REPAIR: Inventory reconciliation' AS check_name,
    gl_balance,
    batch_valuation,
    (gl_balance - batch_valuation) AS difference,
    CASE WHEN ABS(gl_balance - batch_valuation) < 0.01 
         THEN 'MATCHED ✓' 
         ELSE 'DISCREPANCY ✗' 
    END AS status
FROM (
    SELECT
        COALESCE((
            SELECT SUM(le."DebitAmount") - SUM(le."CreditAmount")
            FROM ledger_entries le
            JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
            JOIN accounts a ON le."AccountId" = a."Id"
            WHERE a."AccountCode" = '1300'
              AND lt."Status" = 'POSTED'
        ), 0) AS gl_balance,
        COALESCE((
            SELECT SUM(remaining_quantity * cost_price)
            FROM inventory_batches
            WHERE remaining_quantity > 0
        ), 0) AS batch_valuation
) sub;

-- Full reconciliation summary
SELECT * FROM fn_full_reconciliation_report(CURRENT_DATE);

-- Clean up temp table
DROP TABLE IF EXISTS _duplicate_gl_transactions;
