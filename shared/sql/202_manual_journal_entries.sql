-- =============================================================================
-- Manual Journal Entry Tables
-- =============================================================================
-- This creates tables for manual (adjusting) journal entries separate from
-- the automated ledger transaction system. This supports ERP-grade period
-- closing, reversals, and audit trail requirements.
-- =============================================================================

-- Drop existing tables if they conflict (CAUTION: Only in dev)
-- DROP TABLE IF EXISTS manual_journal_entry_lines CASCADE;
-- DROP TABLE IF EXISTS manual_journal_entries CASCADE;

-- =============================================================================
-- Manual Journal Entries Header Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS manual_journal_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_number VARCHAR(50) NOT NULL UNIQUE,
    entry_date DATE NOT NULL,
    reference VARCHAR(50),
    narration VARCHAR(500) NOT NULL,
    total_debit NUMERIC(18,6) NOT NULL DEFAULT 0,
    total_credit NUMERIC(18,6) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'POSTED' CHECK (status IN ('POSTED', 'REVERSED')),
    created_by VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    reversal_notes TEXT,
    reversed_by_entry_id UUID REFERENCES manual_journal_entries(id),
    
    -- Constraint: Entry must be balanced
    CONSTRAINT chk_balanced_entry CHECK (ABS(total_debit - total_credit) < 0.000001)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mje_entry_date ON manual_journal_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_mje_entry_number ON manual_journal_entries(entry_number);
CREATE INDEX IF NOT EXISTS idx_mje_status ON manual_journal_entries(status);
CREATE INDEX IF NOT EXISTS idx_mje_created_at ON manual_journal_entries(created_at);

-- =============================================================================
-- Manual Journal Entry Lines Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS manual_journal_entry_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_entry_id UUID NOT NULL REFERENCES manual_journal_entries(id) ON DELETE CASCADE,
    line_number INTEGER NOT NULL,
    account_id UUID NOT NULL REFERENCES accounts("Id"),
    debit_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
    credit_amount NUMERIC(18,6) NOT NULL DEFAULT 0,
    description VARCHAR(500),
    entity_type VARCHAR(50),  -- 'CUSTOMER', 'SUPPLIER', 'PRODUCT', 'EMPLOYEE'
    entity_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Each line must have either debit OR credit, not both (or both zero for zero-value entries)
    CONSTRAINT chk_debit_or_credit CHECK (
        (debit_amount > 0 AND credit_amount = 0) OR
        (credit_amount > 0 AND debit_amount = 0) OR
        (debit_amount = 0 AND credit_amount = 0)
    ),
    
    -- Unique line number per entry
    UNIQUE (journal_entry_id, line_number)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_mjel_journal_entry_id ON manual_journal_entry_lines(journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_mjel_account_id ON manual_journal_entry_lines(account_id);
CREATE INDEX IF NOT EXISTS idx_mjel_entity ON manual_journal_entry_lines(entity_type, entity_id);

-- =============================================================================
-- Trigger: Enforce Open Period on Manual Journal Entries
-- =============================================================================
CREATE OR REPLACE FUNCTION trg_enforce_open_period_manual_je()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT fn_is_period_open(NEW.entry_date) THEN
        RAISE EXCEPTION 'Cannot post to closed period. Entry date: %', NEW.entry_date;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_manual_je_period_check ON manual_journal_entries;
CREATE TRIGGER trg_manual_je_period_check
    BEFORE INSERT ON manual_journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION trg_enforce_open_period_manual_je();

-- =============================================================================
-- Function: Generate Next Entry Number
-- =============================================================================
CREATE OR REPLACE FUNCTION fn_next_journal_entry_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
    v_prefix VARCHAR(20) := 'JE-' || v_year || '-';
    v_last_num INTEGER;
    v_next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(NULLIF(SUBSTRING(entry_number FROM LENGTH(v_prefix) + 1), '') AS INTEGER)
    ), 0)
    INTO v_last_num
    FROM manual_journal_entries
    WHERE entry_number LIKE v_prefix || '%';
    
    v_next_num := v_last_num + 1;
    
    RETURN v_prefix || LPAD(v_next_num::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Grants
-- =============================================================================
GRANT SELECT, INSERT, UPDATE ON manual_journal_entries TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON manual_journal_entry_lines TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_next_journal_entry_number() TO PUBLIC;

-- =============================================================================
-- Completion Notice
-- =============================================================================
DO $$
BEGIN
    RAISE NOTICE '✓ Manual Journal Entry tables created successfully';
    RAISE NOTICE '  - manual_journal_entries: Header table for journal entries';
    RAISE NOTICE '  - manual_journal_entry_lines: Line items with DR/CR amounts';
    RAISE NOTICE '  - fn_next_journal_entry_number(): Generate next JE number';
    RAISE NOTICE '  - Period enforcement trigger applied';
END $$;
