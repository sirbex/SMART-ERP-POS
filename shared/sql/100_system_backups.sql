-- ============================================================================
-- SYSTEM BACKUPS TABLE - ERP-Grade Backup Tracking
-- ============================================================================
-- This table tracks all database backups for audit and recovery purposes.
-- Part of the ERP-grade backup, clear, and restore system.
-- ============================================================================

-- Create system_backups table
CREATE TABLE IF NOT EXISTS system_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Backup metadata
    backup_number VARCHAR(50) NOT NULL UNIQUE,     -- BACKUP-YYYY-NNNN format
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL DEFAULT 0,           -- Size in bytes
    checksum VARCHAR(64),                          -- SHA-256 hash for integrity
    
    -- Backup classification
    backup_type VARCHAR(50) NOT NULL DEFAULT 'FULL',  -- FULL, INCREMENTAL, MASTER_DATA_ONLY
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',  -- PENDING, COMPLETED, FAILED, VERIFIED
    
    -- Tracking
    reason VARCHAR(500),                           -- Why the backup was created
    created_by UUID REFERENCES users(id),
    created_by_name VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Verification
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES users(id),
    is_verified BOOLEAN DEFAULT FALSE,
    
    -- Restoration tracking
    last_restored_at TIMESTAMPTZ,
    last_restored_by UUID REFERENCES users(id),
    restore_count INTEGER DEFAULT 0,
    
    -- Statistics snapshot at backup time
    stats_snapshot JSONB,                          -- Database stats at backup time
    
    -- Soft delete
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES users(id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_system_backups_created_at ON system_backups(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_backups_status ON system_backups(status) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_system_backups_backup_number ON system_backups(backup_number);

-- ============================================================================
-- SYSTEM RESET LOG - Immutable audit trail for reset operations
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_reset_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Reset metadata
    reset_number VARCHAR(50) NOT NULL UNIQUE,      -- RESET-YYYY-NNNN format
    reset_type VARCHAR(50) NOT NULL,               -- TRANSACTIONS_ONLY, FULL_RESET
    
    -- Pre-reset backup (MANDATORY)
    backup_id UUID REFERENCES system_backups(id),
    backup_number VARCHAR(50),
    
    -- Authorization
    authorized_by UUID NOT NULL REFERENCES users(id),
    authorized_by_name VARCHAR(255),
    confirmation_phrase VARCHAR(100),              -- The exact phrase user typed
    reason VARCHAR(500) NOT NULL,
    
    -- Execution details
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS', -- IN_PROGRESS, COMPLETED, FAILED, ROLLED_BACK
    
    -- Results
    tables_cleared JSONB,                          -- {table_name: records_deleted, ...}
    records_deleted INTEGER DEFAULT 0,
    balances_reset JSONB,                          -- {customers: X, suppliers: Y, inventory: Z}
    
    -- Error tracking
    error_message TEXT,
    rollback_reason TEXT,
    
    -- IP/Session tracking for security audit
    ip_address VARCHAR(45),
    user_agent VARCHAR(500),
    session_id VARCHAR(100)
);

-- Index for audit queries
CREATE INDEX IF NOT EXISTS idx_system_reset_log_authorized_by ON system_reset_log(authorized_by);
CREATE INDEX IF NOT EXISTS idx_system_reset_log_started_at ON system_reset_log(started_at DESC);

-- ============================================================================
-- SYSTEM MAINTENANCE MODE - Prevents operations during backup/restore
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_maintenance_mode (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    reason VARCHAR(500),
    operation_type VARCHAR(50),                    -- BACKUP, RESTORE, RESET
    
    started_at TIMESTAMPTZ,
    started_by UUID REFERENCES users(id),
    expected_duration_minutes INTEGER,
    
    ended_at TIMESTAMPTZ,
    ended_by UUID REFERENCES users(id)
);

-- Ensure only one maintenance mode record exists
INSERT INTO system_maintenance_mode (id, is_active, reason)
VALUES ('00000000-0000-0000-0000-000000000001', FALSE, NULL)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- SEQUENCE GENERATORS
-- ============================================================================

-- Backup number sequence
CREATE SEQUENCE IF NOT EXISTS backup_number_seq START 1;

-- Reset number sequence  
CREATE SEQUENCE IF NOT EXISTS reset_number_seq START 1;

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generate backup number
CREATE OR REPLACE FUNCTION generate_backup_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_seq := nextval('backup_number_seq');
    RETURN 'BACKUP-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate reset number
CREATE OR REPLACE FUNCTION generate_reset_number()
RETURNS VARCHAR(50) AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_seq := nextval('reset_number_seq');
    RETURN 'RESET-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VALIDATION TRIGGER - Prevent operations during maintenance
-- ============================================================================

CREATE OR REPLACE FUNCTION check_maintenance_mode()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM system_maintenance_mode 
        WHERE is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'System is in maintenance mode. Please try again later.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply maintenance check to critical transaction tables
-- (Can be enabled/disabled during backup/restore)
DO $$
BEGIN
    -- Sales
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_check_sales') THEN
        CREATE TRIGGER trg_maintenance_check_sales
        BEFORE INSERT OR UPDATE OR DELETE ON sales
        FOR EACH ROW EXECUTE FUNCTION check_maintenance_mode();
    END IF;
    
    -- Purchase Orders
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_maintenance_check_po') THEN
        CREATE TRIGGER trg_maintenance_check_po
        BEFORE INSERT OR UPDATE OR DELETE ON purchase_orders
        FOR EACH ROW EXECUTE FUNCTION check_maintenance_mode();
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        NULL; -- Tables don't exist yet
END $$;

COMMENT ON TABLE system_backups IS 'ERP-grade backup tracking with checksums and verification';
COMMENT ON TABLE system_reset_log IS 'Immutable audit trail for system reset operations';
COMMENT ON TABLE system_maintenance_mode IS 'Controls system availability during maintenance operations';
