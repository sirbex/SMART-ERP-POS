-- Migrate existing manual_journal_entries to ledger_transactions
-- This brings manual journal entries into the General Ledger for proper financial reporting

DO $$
DECLARE
    v_je RECORD;
    v_line RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_line_number INTEGER;
    v_migrated_count INTEGER := 0;
    v_skipped_count INTEGER := 0;
BEGIN
    RAISE NOTICE 'Starting migration of manual journal entries to General Ledger...';
    
    -- Process each manual journal entry
    FOR v_je IN 
        SELECT * FROM manual_journal_entries 
        WHERE status = 'POSTED' -- Only migrate POSTED entries
        ORDER BY created_at
    LOOP
        -- Check if already migrated (idempotency check)
        IF EXISTS (
            SELECT 1 FROM ledger_transactions 
            WHERE "ReferenceType" = 'JOURNAL_ENTRY' 
              AND "ReferenceId" = v_je.id
        ) THEN
            RAISE NOTICE 'Skipping % - already in GL', v_je.entry_number;
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;
        
        -- Generate transaction ID and number
        v_transaction_id := gen_random_uuid();
        v_transaction_number := 'TXN-' || LPAD(
            (SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 5) AS INTEGER)), 0) + 1 
             FROM ledger_transactions 
             WHERE "TransactionNumber" LIKE 'TXN-%')::TEXT, 
            6, '0'
        );
        
        -- Create ledger transaction header
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType",
            "ReferenceId", "ReferenceNumber", "Description",
            "TotalDebitAmount", "TotalCreditAmount", "Status",
            "IdempotencyKey", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            v_je.entry_date,
            'JOURNAL_ENTRY',
            v_je.id,
            v_je.entry_number,
            'Journal Entry: ' || v_je.narration,
            v_je.total_debit,
            v_je.total_credit,
            'POSTED',
            'JE-MIGRATE-' || v_je.id,
            v_je.created_at,
            NOW(),
            FALSE
        );
        
        -- Create ledger entry lines
        v_line_number := 1;
        FOR v_line IN 
            SELECT 
                mjel.*,
                a."AccountCode",
                a."AccountName"
            FROM manual_journal_entry_lines mjel
            JOIN accounts a ON a."Id" = mjel.account_id
            WHERE mjel.journal_entry_id = v_je.id
            ORDER BY mjel.line_number
        LOOP
            INSERT INTO ledger_entries (
                "Id", "TransactionId", "AccountId", "EntryType", "Amount",
                "DebitAmount", "CreditAmount", "Description", "LineNumber",
                "EntityType", "EntityId", "CreatedAt"
            ) VALUES (
                gen_random_uuid(),
                v_transaction_id,
                v_line.account_id,
                CASE WHEN v_line.debit_amount > 0 THEN 'DEBIT' ELSE 'CREDIT' END,
                GREATEST(v_line.debit_amount, v_line.credit_amount),
                v_line.debit_amount,
                v_line.credit_amount,
                v_line.description,
                v_line_number,
                v_line.entity_type,
                v_line.entity_id,
                v_je.created_at
            );
            v_line_number := v_line_number + 1;
        END LOOP;
        
        -- Update account balances
        FOR v_line IN 
            SELECT 
                mjel.account_id,
                a."NormalBalance",
                SUM(mjel.debit_amount) as total_debit,
                SUM(mjel.credit_amount) as total_credit
            FROM manual_journal_entry_lines mjel
            JOIN accounts a ON a."Id" = mjel.account_id
            WHERE mjel.journal_entry_id = v_je.id
            GROUP BY mjel.account_id, a."NormalBalance"
        LOOP
            UPDATE accounts
            SET "CurrentBalance" = "CurrentBalance" + 
                CASE 
                    WHEN v_line."NormalBalance" = 'DEBIT' 
                    THEN v_line.total_debit - v_line.total_credit
                    ELSE v_line.total_credit - v_line.total_debit
                END
            WHERE "Id" = v_line.account_id;
        END LOOP;
        
        RAISE NOTICE 'Migrated: % -> %', v_je.entry_number, v_transaction_number;
        v_migrated_count := v_migrated_count + 1;
    END LOOP;
    
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Migration complete!';
    RAISE NOTICE 'Migrated: % entries', v_migrated_count;
    RAISE NOTICE 'Skipped (already in GL): % entries', v_skipped_count;
    RAISE NOTICE '========================================';
END;
$$;

-- Verify migration
SELECT 'JOURNAL ENTRIES IN GL' as section;
SELECT 
    lt."TransactionNumber",
    lt."ReferenceNumber",
    lt."Description",
    lt."TotalDebitAmount",
    lt."TotalCreditAmount",
    lt."Status"
FROM ledger_transactions lt
WHERE lt."ReferenceType" = 'JOURNAL_ENTRY'
ORDER BY lt."TransactionDate";
