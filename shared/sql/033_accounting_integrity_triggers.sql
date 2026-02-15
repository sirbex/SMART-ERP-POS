-- ============================================================================
-- ACCOUNTING INTEGRITY TRIGGERS
-- ============================================================================
-- These triggers enforce accounting integrity at the database level.
-- They prevent data corruption that could cause GL/subledger mismatches.
-- ============================================================================

-- ============================================================================
-- 1. JOURNAL ENTRY BALANCE TRIGGER
-- Ensures every journal entry has balanced debits and credits
-- ============================================================================

CREATE OR REPLACE FUNCTION check_journal_entry_balance()
RETURNS TRIGGER AS $$
DECLARE
    total_debits NUMERIC;
    total_credits NUMERIC;
BEGIN
    -- Calculate totals for this journal entry
    SELECT 
        COALESCE(SUM("DebitAmount"), 0),
        COALESCE(SUM("CreditAmount"), 0)
    INTO total_debits, total_credits
    FROM journal_entry_lines
    WHERE "JournalEntryId" = NEW."JournalEntryId";
    
    -- Check if balanced (allow small rounding differences)
    IF ABS(total_debits - total_credits) > 0.01 THEN
        RAISE EXCEPTION 'Journal entry % is not balanced. Debits: %, Credits: %',
            NEW."JournalEntryId", total_debits, total_credits;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trg_check_journal_entry_balance ON journal_entry_lines;

CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balance
AFTER INSERT OR UPDATE ON journal_entry_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION check_journal_entry_balance();

-- ============================================================================
-- 2. CREDIT SALE REQUIRES CUSTOMER
-- Prevents credit sales without a customer
-- ============================================================================

CREATE OR REPLACE FUNCTION check_credit_sale_customer()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_method = 'CREDIT' AND NEW.customer_id IS NULL THEN
        RAISE EXCEPTION 'Credit sales require a customer. Sale: %', NEW.sale_number;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_credit_sale_customer ON sales;

CREATE TRIGGER trg_check_credit_sale_customer
BEFORE INSERT OR UPDATE ON sales
FOR EACH ROW
EXECUTE FUNCTION check_credit_sale_customer();

-- ============================================================================
-- 3. CUSTOMER BALANCE UPDATE AUDIT
-- Logs all customer balance changes for debugging
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_balance_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    customer_name VARCHAR(255),
    old_balance NUMERIC(15,2),
    new_balance NUMERIC(15,2),
    change_amount NUMERIC(15,2),
    change_source VARCHAR(100),
    reference_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_balance_audit_customer 
ON customer_balance_audit(customer_id, created_at DESC);

CREATE OR REPLACE FUNCTION audit_customer_balance_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        INSERT INTO customer_balance_audit (
            customer_id,
            customer_name,
            old_balance,
            new_balance,
            change_amount,
            change_source
        ) VALUES (
            NEW.id,
            NEW.name,
            COALESCE(OLD.balance, 0),
            COALESCE(NEW.balance, 0),
            COALESCE(NEW.balance, 0) - COALESCE(OLD.balance, 0),
            'TRIGGER'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_customer_balance ON customers;

CREATE TRIGGER trg_audit_customer_balance
AFTER UPDATE ON customers
FOR EACH ROW
EXECUTE FUNCTION audit_customer_balance_change();

-- ============================================================================
-- 4. PREVENT NEGATIVE INVENTORY
-- Prevents inventory quantities from going negative
-- ============================================================================

CREATE OR REPLACE FUNCTION check_inventory_not_negative()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.quantity < 0 THEN
        RAISE EXCEPTION 'Inventory quantity cannot be negative. Batch: %, Current: %',
            NEW.id, NEW.quantity;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_inventory_not_negative ON inventory_batches;

CREATE TRIGGER trg_check_inventory_not_negative
BEFORE UPDATE ON inventory_batches
FOR EACH ROW
EXECUTE FUNCTION check_inventory_not_negative();

-- ============================================================================
-- 5. LEDGER ENTRY SYNC TRIGGER
-- Automatically creates ledger entries when journal entries are posted
-- ============================================================================

CREATE OR REPLACE FUNCTION sync_ledger_from_journal()
RETURNS TRIGGER AS $$
DECLARE
    je_record RECORD;
BEGIN
    -- Only sync when status changes to 'POSTED' or on new POSTED entries
    IF NEW."Status" = 'POSTED' AND (OLD IS NULL OR OLD."Status" != 'POSTED') THEN
        -- Get the journal entry details
        SELECT * INTO je_record FROM journal_entries WHERE "Id" = NEW."Id";
        
        -- Insert ledger entries for each line
        INSERT INTO ledger_entries (
            "Id",
            "TransactionId",
            "AccountId",
            "EntryType",
            "Amount",
            "DebitAmount",
            "CreditAmount",
            "Description",
            "EntityId",
            "EntityType",
            "EntryDate",
            "JournalEntryLineId",
            "CreatedAt"
        )
        SELECT 
            gen_random_uuid(),
            je_record."Id",
            jel."AccountId",
            CASE 
                WHEN jel."DebitAmount" > 0 THEN 'DEBIT'
                ELSE 'CREDIT'
            END,
            GREATEST(jel."DebitAmount", jel."CreditAmount"),
            jel."DebitAmount",
            jel."CreditAmount",
            jel."Description",
            jel."EntityId",
            jel."EntityType",
            je_record."EntryDate",
            jel."Id",
            NOW()
        FROM journal_entry_lines jel
        WHERE jel."JournalEntryId" = NEW."Id"
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_ledger_from_journal ON journal_entries;

CREATE TRIGGER trg_sync_ledger_from_journal
AFTER INSERT OR UPDATE ON journal_entries
FOR EACH ROW
EXECUTE FUNCTION sync_ledger_from_journal();

-- ============================================================================
-- 6. AR/AP RECONCILIATION CHECK FUNCTION
-- Can be called to verify GL matches subledger
-- ============================================================================

CREATE OR REPLACE FUNCTION check_ar_reconciliation()
RETURNS TABLE (
    gl_balance NUMERIC,
    subledger_balance NUMERIC,
    difference NUMERIC,
    is_balanced BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200') as gl_balance,
        (SELECT COALESCE(SUM(balance), 0) FROM customers) as subledger_balance,
        (SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200') - 
        (SELECT COALESCE(SUM(balance), 0) FROM customers) as difference,
        ABS((SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200') - 
        (SELECT COALESCE(SUM(balance), 0) FROM customers)) < 0.01 as is_balanced;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION check_ap_reconciliation()
RETURNS TABLE (
    gl_balance NUMERIC,
    subledger_balance NUMERIC,
    difference NUMERIC,
    is_balanced BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100') as gl_balance,
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers) as subledger_balance,
        (SELECT COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100') - 
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers) as difference,
        ABS((SELECT COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100') - 
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers)) < 0.01 as is_balanced;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 7. INTEGRITY CHECK VIEW
-- Quick view to check all reconciliations at once
-- ============================================================================

CREATE OR REPLACE VIEW v_accounting_integrity AS
SELECT 
    'AR (1200)' as account,
    ar.gl_balance,
    ar.subledger_balance,
    ar.difference,
    ar.is_balanced
FROM check_ar_reconciliation() ar
UNION ALL
SELECT 
    'AP (2100)' as account,
    ap.gl_balance,
    ap.subledger_balance,
    ap.difference,
    ap.is_balanced
FROM check_ap_reconciliation() ap;

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================
-- Uncomment and adjust as needed for your database user
-- GRANT SELECT ON v_accounting_integrity TO pos_app_user;
-- GRANT EXECUTE ON FUNCTION check_ar_reconciliation() TO pos_app_user;
-- GRANT EXECUTE ON FUNCTION check_ap_reconciliation() TO pos_app_user;

COMMENT ON VIEW v_accounting_integrity IS 
'Quick view to check GL vs subledger reconciliation for AR and AP accounts';

COMMENT ON FUNCTION check_journal_entry_balance() IS
'Ensures journal entries are balanced (debits = credits)';

COMMENT ON FUNCTION check_credit_sale_customer() IS
'Ensures credit sales have a customer assigned';

COMMENT ON TABLE customer_balance_audit IS
'Audit trail of all customer balance changes for debugging';
