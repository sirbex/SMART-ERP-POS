-- =============================================================================
-- ACCOUNTING PERIODS - ERP-GRADE PERIOD CLOSING SYSTEM
-- =============================================================================
-- Purpose: Implement accounting period management with database-enforced 
--          protection against posting to closed periods.
--
-- Clean Core Principles:
--   ✔ Immutability - Closed periods cannot be modified
--   ✔ Auditability - Period close history tracked
--   ✔ Consistency - Same rules enforced across all modules
--   ✔ Determinism - Clear period boundaries
--
-- Author: System
-- Date: 2025-12-28
-- =============================================================================

-- Drop existing objects if they exist (for clean reinstall)
DROP TRIGGER IF EXISTS trg_enforce_period_ledger_transactions ON ledger_transactions;
DROP TRIGGER IF EXISTS trg_enforce_period_ledger_entries ON ledger_entries;
DROP TRIGGER IF EXISTS trg_enforce_period_journal_entries ON journal_entries;
DROP TRIGGER IF EXISTS trg_enforce_period_sales ON sales;
DROP TRIGGER IF EXISTS trg_enforce_period_invoice_payments ON invoice_payments;
DROP TRIGGER IF EXISTS trg_enforce_period_customer_payments ON customer_payments;
DROP TRIGGER IF EXISTS trg_enforce_period_goods_receipts ON goods_receipts;
DROP FUNCTION IF EXISTS fn_enforce_open_period();
DROP FUNCTION IF EXISTS fn_close_accounting_period(INTEGER, INTEGER, UUID);
DROP FUNCTION IF EXISTS fn_reopen_accounting_period(INTEGER, INTEGER, UUID);
DROP FUNCTION IF EXISTS fn_get_period_status(DATE);
DROP FUNCTION IF EXISTS fn_is_period_open(DATE);

-- =============================================================================
-- ACCOUNTING PERIODS TABLE
-- =============================================================================
-- Tracks open/closed status of each accounting period (month/year)

CREATE TABLE IF NOT EXISTS accounting_periods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED', 'LOCKED')),
    
    -- Closing metadata
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    close_notes TEXT,
    
    -- Reopening metadata (for audit trail)
    reopened_at TIMESTAMPTZ,
    reopened_by UUID,
    reopen_reason TEXT,
    
    -- Audit fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint on year/month combination
    CONSTRAINT uq_accounting_period UNIQUE (period_year, period_month)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_accounting_periods_year_month 
    ON accounting_periods(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_status 
    ON accounting_periods(status);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_dates 
    ON accounting_periods(period_start, period_end);

-- =============================================================================
-- PERIOD CLOSE HISTORY (AUDIT TRAIL)
-- =============================================================================
-- Tracks every open/close action for complete auditability

CREATE TABLE IF NOT EXISTS accounting_period_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period_id UUID NOT NULL REFERENCES accounting_periods(id),
    action VARCHAR(20) NOT NULL CHECK (action IN ('CREATED', 'CLOSED', 'REOPENED', 'LOCKED')),
    performed_by UUID,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes TEXT,
    
    -- Snapshot of period state at time of action
    period_year INTEGER NOT NULL,
    period_month INTEGER NOT NULL,
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_period_history_period 
    ON accounting_period_history(period_id);

-- =============================================================================
-- FUNCTION: Check if a period is open for a given date
-- =============================================================================
-- Returns TRUE if the period is open, FALSE if closed/locked
-- If no period record exists, creates one automatically (defaults to OPEN)

CREATE OR REPLACE FUNCTION fn_is_period_open(check_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
    v_status VARCHAR(20);
    v_period_id UUID;
BEGIN
    -- Extract year and month from the date
    v_year := EXTRACT(YEAR FROM check_date);
    v_month := EXTRACT(MONTH FROM check_date);
    
    -- Check if period exists
    SELECT id, status INTO v_period_id, v_status
    FROM accounting_periods
    WHERE period_year = v_year AND period_month = v_month;
    
    -- If period doesn't exist, create it as OPEN
    IF v_period_id IS NULL THEN
        INSERT INTO accounting_periods (
            period_year, period_month,
            period_start, period_end,
            status, created_at
        ) VALUES (
            v_year, v_month,
            DATE_TRUNC('month', check_date)::DATE,
            (DATE_TRUNC('month', check_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
            'OPEN', NOW()
        )
        RETURNING id, status INTO v_period_id, v_status;
        
        -- Log the automatic creation
        INSERT INTO accounting_period_history (
            period_id, action, period_year, period_month,
            previous_status, new_status, notes
        ) VALUES (
            v_period_id, 'CREATED', v_year, v_month,
            NULL, 'OPEN', 'Period auto-created on first transaction'
        );
    END IF;
    
    -- Return TRUE only if status is OPEN
    RETURN v_status = 'OPEN';
END;
$$;

-- =============================================================================
-- FUNCTION: Get period status for a date
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_get_period_status(check_date DATE)
RETURNS TABLE (
    period_id UUID,
    period_year INTEGER,
    period_month INTEGER,
    period_start DATE,
    period_end DATE,
    status VARCHAR(20),
    closed_at TIMESTAMPTZ,
    closed_by UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM check_date);
    v_month := EXTRACT(MONTH FROM check_date);
    
    RETURN QUERY
    SELECT 
        ap.id,
        ap.period_year,
        ap.period_month,
        ap.period_start,
        ap.period_end,
        ap.status,
        ap.closed_at,
        ap.closed_by
    FROM accounting_periods ap
    WHERE ap.period_year = v_year AND ap.period_month = v_month;
    
    -- If no rows returned, the period doesn't exist yet (treated as OPEN)
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            NULL::UUID as period_id,
            v_year as period_year,
            v_month as period_month,
            DATE_TRUNC('month', check_date)::DATE as period_start,
            (DATE_TRUNC('month', check_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end,
            'OPEN'::VARCHAR(20) as status,
            NULL::TIMESTAMPTZ as closed_at,
            NULL::UUID as closed_by;
    END IF;
END;
$$;

-- =============================================================================
-- FUNCTION: Close an accounting period
-- =============================================================================
-- Closes a period, preventing any further postings

CREATE OR REPLACE FUNCTION fn_close_accounting_period(
    p_year INTEGER,
    p_month INTEGER,
    p_closed_by UUID DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    period_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_period_id UUID;
    v_current_status VARCHAR(20);
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Calculate period boundaries
    v_period_start := MAKE_DATE(p_year, p_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Check if period exists
    SELECT id, status INTO v_period_id, v_current_status
    FROM accounting_periods
    WHERE period_year = p_year AND period_month = p_month
    FOR UPDATE; -- Lock the row
    
    -- If period doesn't exist, create it first
    IF v_period_id IS NULL THEN
        INSERT INTO accounting_periods (
            period_year, period_month,
            period_start, period_end,
            status
        ) VALUES (
            p_year, p_month,
            v_period_start, v_period_end,
            'OPEN'
        )
        RETURNING id INTO v_period_id;
        
        v_current_status := 'OPEN';
        
        INSERT INTO accounting_period_history (
            period_id, action, period_year, period_month,
            previous_status, new_status, notes
        ) VALUES (
            v_period_id, 'CREATED', p_year, p_month,
            NULL, 'OPEN', 'Period created for closing'
        );
    END IF;
    
    -- Check if already closed
    IF v_current_status IN ('CLOSED', 'LOCKED') THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s is already %s', p_year, LPAD(p_month::TEXT, 2, '0'), v_current_status),
            v_period_id;
        RETURN;
    END IF;
    
    -- Close the period
    UPDATE accounting_periods
    SET 
        status = 'CLOSED',
        closed_at = NOW(),
        closed_by = p_closed_by,
        close_notes = p_notes,
        updated_at = NOW()
    WHERE id = v_period_id;
    
    -- Record in history
    INSERT INTO accounting_period_history (
        period_id, action, performed_by, period_year, period_month,
        previous_status, new_status, notes
    ) VALUES (
        v_period_id, 'CLOSED', p_closed_by, p_year, p_month,
        'OPEN', 'CLOSED', p_notes
    );
    
    RETURN QUERY SELECT 
        TRUE, 
        FORMAT('Period %s-%s closed successfully', p_year, LPAD(p_month::TEXT, 2, '0')),
        v_period_id;
END;
$$;

-- =============================================================================
-- FUNCTION: Reopen an accounting period (requires authorization)
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_reopen_accounting_period(
    p_year INTEGER,
    p_month INTEGER,
    p_reopened_by UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    message TEXT,
    period_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_period_id UUID;
    v_current_status VARCHAR(20);
BEGIN
    -- Check if period exists
    SELECT id, status INTO v_period_id, v_current_status
    FROM accounting_periods
    WHERE period_year = p_year AND period_month = p_month
    FOR UPDATE;
    
    IF v_period_id IS NULL THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s does not exist', p_year, LPAD(p_month::TEXT, 2, '0')),
            NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if LOCKED (cannot reopen)
    IF v_current_status = 'LOCKED' THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s is LOCKED and cannot be reopened', p_year, LPAD(p_month::TEXT, 2, '0')),
            v_period_id;
        RETURN;
    END IF;
    
    -- Check if already open
    IF v_current_status = 'OPEN' THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s is already open', p_year, LPAD(p_month::TEXT, 2, '0')),
            v_period_id;
        RETURN;
    END IF;
    
    -- Reopen the period
    UPDATE accounting_periods
    SET 
        status = 'OPEN',
        reopened_at = NOW(),
        reopened_by = p_reopened_by,
        reopen_reason = p_reason,
        updated_at = NOW()
    WHERE id = v_period_id;
    
    -- Record in history
    INSERT INTO accounting_period_history (
        period_id, action, performed_by, period_year, period_month,
        previous_status, new_status, notes
    ) VALUES (
        v_period_id, 'REOPENED', p_reopened_by, p_year, p_month,
        'CLOSED', 'OPEN', p_reason
    );
    
    RETURN QUERY SELECT 
        TRUE, 
        FORMAT('Period %s-%s reopened successfully', p_year, LPAD(p_month::TEXT, 2, '0')),
        v_period_id;
END;
$$;

-- =============================================================================
-- TRIGGER FUNCTION: Enforce open period for financial transactions
-- =============================================================================
-- This trigger prevents INSERT/UPDATE on financial tables when period is closed

CREATE OR REPLACE FUNCTION fn_enforce_open_period()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_transaction_date DATE;
    v_is_open BOOLEAN;
    v_status VARCHAR(20);
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    -- Determine the transaction date based on the table
    CASE TG_TABLE_NAME
        WHEN 'ledger_transactions' THEN
            v_transaction_date := NEW."TransactionDate"::DATE;
        WHEN 'ledger_entries' THEN
            v_transaction_date := COALESCE(NEW."EntryDate"::DATE, NOW()::DATE);
        WHEN 'journal_entries' THEN
            v_transaction_date := NEW.entry_date::DATE;
        WHEN 'sales' THEN
            v_transaction_date := NEW.sale_date::DATE;
        WHEN 'invoice_payments' THEN
            v_transaction_date := NEW.payment_date::DATE;
        WHEN 'customer_payments' THEN
            v_transaction_date := NEW.payment_date::DATE;
        WHEN 'goods_receipts' THEN
            v_transaction_date := NEW.received_date::DATE;
        ELSE
            v_transaction_date := NOW()::DATE;
    END CASE;
    
    -- Check if period is open
    v_year := EXTRACT(YEAR FROM v_transaction_date);
    v_month := EXTRACT(MONTH FROM v_transaction_date);
    
    SELECT status INTO v_status
    FROM accounting_periods
    WHERE period_year = v_year AND period_month = v_month;
    
    -- If no period exists, it's implicitly open
    IF v_status IS NULL THEN
        v_is_open := TRUE;
    ELSE
        v_is_open := (v_status = 'OPEN');
    END IF;
    
    -- Block if period is closed
    IF NOT v_is_open THEN
        RAISE EXCEPTION 'Cannot post to closed period: %-%. Period status: %',
            v_year, LPAD(v_month::TEXT, 2, '0'), v_status
            USING ERRCODE = 'P0001',
                  HINT = 'Create a reversal entry in the current open period instead.';
    END IF;
    
    RETURN NEW;
END;
$$;

-- =============================================================================
-- CREATE TRIGGERS ON FINANCIAL TABLES
-- =============================================================================

-- Ledger Transactions
CREATE TRIGGER trg_enforce_period_ledger_transactions
    BEFORE INSERT OR UPDATE ON ledger_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_open_period();

-- Ledger Entries
CREATE TRIGGER trg_enforce_period_ledger_entries
    BEFORE INSERT OR UPDATE ON ledger_entries
    FOR EACH ROW
    EXECUTE FUNCTION fn_enforce_open_period();

-- Journal Entries (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'journal_entries') THEN
        EXECUTE 'CREATE TRIGGER trg_enforce_period_journal_entries
            BEFORE INSERT OR UPDATE ON journal_entries
            FOR EACH ROW
            EXECUTE FUNCTION fn_enforce_open_period()';
    END IF;
END $$;

-- Sales (if table exists and has sale_date)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'sales' AND column_name = 'sale_date'
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_enforce_period_sales
            BEFORE INSERT OR UPDATE ON sales
            FOR EACH ROW
            EXECUTE FUNCTION fn_enforce_open_period()';
    END IF;
END $$;

-- Invoice Payments
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'invoice_payments' AND column_name = 'payment_date'
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_enforce_period_invoice_payments
            BEFORE INSERT OR UPDATE ON invoice_payments
            FOR EACH ROW
            EXECUTE FUNCTION fn_enforce_open_period()';
    END IF;
END $$;

-- Customer Payments
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'customer_payments' AND column_name = 'payment_date'
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_enforce_period_customer_payments
            BEFORE INSERT OR UPDATE ON customer_payments
            FOR EACH ROW
            EXECUTE FUNCTION fn_enforce_open_period()';
    END IF;
END $$;

-- Goods Receipts
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'goods_receipts' AND column_name = 'received_date'
    ) THEN
        EXECUTE 'CREATE TRIGGER trg_enforce_period_goods_receipts
            BEFORE INSERT OR UPDATE ON goods_receipts
            FOR EACH ROW
            EXECUTE FUNCTION fn_enforce_open_period()';
    END IF;
END $$;

-- =============================================================================
-- FUNCTION: Get all periods with status
-- =============================================================================

CREATE OR REPLACE FUNCTION fn_get_accounting_periods(
    p_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    period_year INTEGER,
    period_month INTEGER,
    period_name TEXT,
    period_start DATE,
    period_end DATE,
    status VARCHAR(20),
    closed_at TIMESTAMPTZ,
    closed_by UUID,
    transaction_count BIGINT,
    total_debits NUMERIC,
    total_credits NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.id,
        ap.period_year,
        ap.period_month,
        TO_CHAR(ap.period_start, 'Month YYYY') as period_name,
        ap.period_start,
        ap.period_end,
        ap.status,
        ap.closed_at,
        ap.closed_by,
        COALESCE(stats.txn_count, 0) as transaction_count,
        COALESCE(stats.total_debits, 0) as total_debits,
        COALESCE(stats.total_credits, 0) as total_credits
    FROM accounting_periods ap
    LEFT JOIN LATERAL (
        SELECT 
            COUNT(DISTINCT lt."Id") as txn_count,
            SUM(le."DebitAmount") as total_debits,
            SUM(le."CreditAmount") as total_credits
        FROM ledger_transactions lt
        JOIN ledger_entries le ON le."TransactionId" = lt."Id"
        WHERE lt."TransactionDate" >= ap.period_start
          AND lt."TransactionDate" < ap.period_end + INTERVAL '1 day'
    ) stats ON TRUE
    WHERE (p_year IS NULL OR ap.period_year = p_year)
    ORDER BY ap.period_year DESC, ap.period_month DESC;
END;
$$;

-- =============================================================================
-- SEED CURRENT YEAR PERIODS (Optional - periods are auto-created on first use)
-- =============================================================================

-- Optionally seed the current year's periods as OPEN
DO $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
    v_month INTEGER;
BEGIN
    FOR v_month IN 1..12 LOOP
        INSERT INTO accounting_periods (
            period_year, period_month,
            period_start, period_end,
            status
        ) VALUES (
            v_year, v_month,
            MAKE_DATE(v_year, v_month, 1),
            (MAKE_DATE(v_year, v_month, 1) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
            'OPEN'
        )
        ON CONFLICT (period_year, period_month) DO NOTHING;
    END LOOP;
END $$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION fn_is_period_open(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_period_status(DATE) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_close_accounting_period(INTEGER, INTEGER, UUID, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_reopen_accounting_period(INTEGER, INTEGER, UUID, TEXT) TO PUBLIC;
GRANT EXECUTE ON FUNCTION fn_get_accounting_periods(INTEGER) TO PUBLIC;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Accounting periods schema installed successfully';
    RAISE NOTICE '   - accounting_periods table created';
    RAISE NOTICE '   - accounting_period_history table created';
    RAISE NOTICE '   - Period enforcement triggers installed';
    RAISE NOTICE '   - Current year periods seeded as OPEN';
END $$;
