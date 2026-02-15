-- =====================================================
-- AUDIT TRAIL SYSTEM - DATABASE SCHEMA
-- Migration: 027_create_audit_log.sql
-- Purpose: Comprehensive audit logging for all system operations
-- Date: November 23, 2025
-- =====================================================

-- =====================================================
-- 1. MAIN AUDIT LOG TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS audit_log (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity being audited
    entity_type VARCHAR(50) NOT NULL, -- SALE, INVOICE, PAYMENT, PRODUCT, CUSTOMER, USER, etc.
    entity_id UUID, -- Reference to the actual entity
    entity_number VARCHAR(100), -- Business identifier (SALE-2025-0001, INV-00123, etc.)
    
    -- Action performed
    action VARCHAR(50) NOT NULL, -- CREATE, UPDATE, DELETE, VOID, REFUND, LOGIN, LOGOUT, etc.
    action_details TEXT, -- Human-readable description
    
    -- User who performed the action
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    user_name VARCHAR(255), -- Denormalized for faster queries
    user_role VARCHAR(50), -- User's role at time of action
    
    -- Change tracking
    old_values JSONB, -- State before change
    new_values JSONB, -- State after change
    changes JSONB, -- Calculated diff between old and new
    
    -- Context information
    ip_address INET, -- IP address of request
    user_agent TEXT, -- Browser/client information
    session_id UUID, -- Link to user session
    request_id UUID, -- For correlating multiple operations
    
    -- Metadata
    severity VARCHAR(20) DEFAULT 'INFO', -- INFO, WARNING, ERROR, CRITICAL
    category VARCHAR(50), -- FINANCIAL, INVENTORY, ACCESS, CONFIGURATION
    tags TEXT[], -- Searchable tags for filtering
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Additional context
    notes TEXT, -- Optional notes
    reference_number VARCHAR(100), -- External reference (PO number, invoice number, etc.)
    
    -- Constraints
    CONSTRAINT audit_log_entity_type_check CHECK (entity_type IN (
        'SALE', 'INVOICE', 'PAYMENT', 'PRODUCT', 'CUSTOMER', 'SUPPLIER',
        'USER', 'PURCHASE_ORDER', 'GOODS_RECEIPT', 'INVENTORY_ADJUSTMENT',
        'BATCH', 'PRICING', 'SETTINGS', 'REPORT', 'SYSTEM'
    )),
    CONSTRAINT audit_log_action_check CHECK (action IN (
        'CREATE', 'UPDATE', 'DELETE', 'VOID', 'CANCEL', 'REFUND', 'EXCHANGE',
        'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'PERMISSION_CHANGE',
        'APPROVE', 'REJECT', 'RESTORE', 'ARCHIVE', 'EXPORT', 'IMPORT',
        'OPEN_DRAWER', 'CLOSE_SHIFT', 'ADJUST_INVENTORY', 'PRICE_CHANGE'
    )),
    CONSTRAINT audit_log_severity_check CHECK (severity IN ('INFO', 'WARNING', 'ERROR', 'CRITICAL'))
);

-- Indexes for performance
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_entity_number ON audit_log(entity_number) WHERE entity_number IS NOT NULL;
CREATE INDEX idx_audit_log_user ON audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action ON audit_log(action, created_at DESC);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_severity ON audit_log(severity) WHERE severity IN ('ERROR', 'CRITICAL');
CREATE INDEX idx_audit_log_category ON audit_log(category);
CREATE INDEX idx_audit_log_session ON audit_log(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX idx_audit_log_tags ON audit_log USING GIN(tags);

-- Comments for documentation
COMMENT ON TABLE audit_log IS 'Comprehensive audit trail for all system operations';
COMMENT ON COLUMN audit_log.entity_type IS 'Type of entity being audited';
COMMENT ON COLUMN audit_log.entity_id IS 'UUID of the entity (internal reference)';
COMMENT ON COLUMN audit_log.entity_number IS 'Human-readable business identifier';
COMMENT ON COLUMN audit_log.action IS 'Action performed on the entity';
COMMENT ON COLUMN audit_log.old_values IS 'Entity state before change (for UPDATE/DELETE)';
COMMENT ON COLUMN audit_log.new_values IS 'Entity state after change (for CREATE/UPDATE)';
COMMENT ON COLUMN audit_log.changes IS 'Calculated diff showing only changed fields';

-- =====================================================
-- 2. USER SESSIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS user_sessions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- User information
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    
    -- Session details
    login_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    logout_at TIMESTAMPTZ,
    session_duration_seconds INT, -- Calculated on logout
    
    -- Device/location information
    ip_address INET,
    user_agent TEXT,
    device_type VARCHAR(50), -- DESKTOP, MOBILE, TABLET, POS_TERMINAL
    terminal_id VARCHAR(50), -- Physical POS terminal identifier
    
    -- Session state
    is_active BOOLEAN NOT NULL DEFAULT true,
    logout_reason VARCHAR(50), -- MANUAL, TIMEOUT, FORCED, ERROR
    
    -- Activity tracking
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actions_count INT DEFAULT 0, -- Number of actions in this session
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT user_sessions_logout_check CHECK (
        logout_at IS NULL OR logout_at >= login_at
    )
);

-- Indexes
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id, login_at DESC);
CREATE INDEX idx_user_sessions_active ON user_sessions(is_active, last_activity_at) WHERE is_active = true;
CREATE INDEX idx_user_sessions_terminal ON user_sessions(terminal_id) WHERE terminal_id IS NOT NULL;
CREATE INDEX idx_user_sessions_logout ON user_sessions(logout_at) WHERE logout_at IS NOT NULL;

-- Comments
COMMENT ON TABLE user_sessions IS 'Track user login sessions for audit and security';
COMMENT ON COLUMN user_sessions.session_duration_seconds IS 'Total session duration in seconds (calculated on logout)';
COMMENT ON COLUMN user_sessions.last_activity_at IS 'Updated on each user action for idle timeout detection';
COMMENT ON COLUMN user_sessions.actions_count IS 'Number of audited actions performed in this session';

-- =====================================================
-- 3. FAILED TRANSACTIONS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS failed_transactions (
    -- Primary identification
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL, -- SALE, PAYMENT, REFUND, etc.
    attempted_data JSONB NOT NULL, -- What the user tried to do
    
    -- Error information
    error_type VARCHAR(100) NOT NULL, -- VALIDATION_ERROR, DATABASE_ERROR, etc.
    error_message TEXT NOT NULL,
    error_stack TEXT, -- Full stack trace for debugging
    
    -- User context
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    user_name VARCHAR(255),
    session_id UUID,
    
    -- Request context
    ip_address INET,
    user_agent TEXT,
    request_id UUID,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    severity VARCHAR(20) DEFAULT 'ERROR',
    
    -- Additional context
    notes TEXT,
    resolved_at TIMESTAMPTZ, -- When the issue was resolved
    resolved_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    
    -- Constraints
    CONSTRAINT failed_transactions_type_check CHECK (transaction_type IN (
        'SALE', 'PAYMENT', 'REFUND', 'RETURN', 'EXCHANGE',
        'INVOICE_CREATION', 'INVOICE_PAYMENT', 'VOID',
        'INVENTORY_ADJUSTMENT', 'PURCHASE_ORDER', 'GOODS_RECEIPT'
    )),
    CONSTRAINT failed_transactions_severity_check CHECK (severity IN ('WARNING', 'ERROR', 'CRITICAL'))
);

-- Indexes
CREATE INDEX idx_failed_transactions_type ON failed_transactions(transaction_type, created_at DESC);
CREATE INDEX idx_failed_transactions_user ON failed_transactions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_failed_transactions_created ON failed_transactions(created_at DESC);
CREATE INDEX idx_failed_transactions_unresolved ON failed_transactions(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_failed_transactions_error_type ON failed_transactions(error_type);

-- Comments
COMMENT ON TABLE failed_transactions IS 'Log failed transaction attempts for debugging and security monitoring';
COMMENT ON COLUMN failed_transactions.attempted_data IS 'JSON snapshot of what the user tried to submit';
COMMENT ON COLUMN failed_transactions.error_stack IS 'Full stack trace for technical debugging';
COMMENT ON COLUMN failed_transactions.resolved_at IS 'When the underlying issue was fixed';

-- =====================================================
-- 4. HELPER FUNCTIONS
-- =====================================================

-- Function to calculate session duration on logout
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.logout_at IS NOT NULL AND OLD.logout_at IS NULL THEN
        NEW.session_duration_seconds := EXTRACT(EPOCH FROM (NEW.logout_at - NEW.login_at))::INT;
        NEW.is_active := false;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for session duration calculation
DROP TRIGGER IF EXISTS trigger_update_session_duration ON user_sessions;
CREATE TRIGGER trigger_update_session_duration
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_duration();

-- Function to auto-update last_activity_at
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE user_sessions
    SET 
        last_activity_at = NOW(),
        actions_count = actions_count + 1,
        updated_at = NOW()
    WHERE id = NEW.session_id AND is_active = true;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session activity on audit log insert
DROP TRIGGER IF EXISTS trigger_update_session_activity ON audit_log;
CREATE TRIGGER trigger_update_session_activity
    AFTER INSERT ON audit_log
    FOR EACH ROW
    WHEN (NEW.session_id IS NOT NULL)
    EXECUTE FUNCTION update_session_activity();

-- =====================================================
-- 5. VIEWS FOR COMMON QUERIES
-- =====================================================

-- View: Recent audit activity (last 7 days)
CREATE OR REPLACE VIEW recent_audit_activity AS
SELECT 
    al.id,
    al.entity_type,
    al.entity_number,
    al.action,
    al.action_details,
    al.user_name,
    al.user_role,
    al.severity,
    al.category,
    al.created_at,
    al.ip_address
FROM audit_log al
WHERE al.created_at >= NOW() - INTERVAL '7 days'
ORDER BY al.created_at DESC;

-- View: Active user sessions
CREATE OR REPLACE VIEW active_user_sessions AS
SELECT 
    us.id,
    us.user_name,
    us.user_role,
    us.login_at,
    us.last_activity_at,
    NOW() - us.last_activity_at AS idle_duration,
    us.actions_count,
    us.terminal_id,
    us.ip_address
FROM user_sessions us
WHERE us.is_active = true
ORDER BY us.last_activity_at DESC;

-- View: Failed transaction summary
CREATE OR REPLACE VIEW failed_transaction_summary AS
SELECT 
    ft.transaction_type,
    ft.error_type,
    COUNT(*) AS failure_count,
    MAX(ft.created_at) AS last_occurrence,
    COUNT(*) FILTER (WHERE ft.resolved_at IS NULL) AS unresolved_count
FROM failed_transactions ft
WHERE ft.created_at >= NOW() - INTERVAL '30 days'
GROUP BY ft.transaction_type, ft.error_type
ORDER BY failure_count DESC;

-- =====================================================
-- 6. SAMPLE DATA FOR TESTING (OPTIONAL)
-- =====================================================

-- Insert a test audit entry
-- INSERT INTO audit_log (
--     entity_type, entity_id, entity_number, action, action_details,
--     user_id, user_name, user_role, category, severity
-- ) VALUES (
--     'SYSTEM', gen_random_uuid(), 'SYS-INIT', 'CREATE', 
--     'Audit trail system initialized',
--     (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1),
--     (SELECT username FROM users WHERE role = 'ADMIN' LIMIT 1),
--     'ADMIN',
--     'SYSTEM',
--     'INFO'
-- );

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

-- Grant read access to all authenticated users
GRANT SELECT ON audit_log TO PUBLIC;
GRANT SELECT ON user_sessions TO PUBLIC;
GRANT SELECT ON failed_transactions TO PUBLIC;

-- Grant write access only to application role (adjust as needed)
-- GRANT INSERT ON audit_log TO pos_application;
-- GRANT INSERT, UPDATE ON user_sessions TO pos_application;
-- GRANT INSERT ON failed_transactions TO pos_application;

-- =====================================================
-- END OF MIGRATION
-- =====================================================

-- Verification queries (run after migration)
-- SELECT COUNT(*) FROM audit_log;
-- SELECT COUNT(*) FROM user_sessions;
-- SELECT COUNT(*) FROM failed_transactions;
-- SELECT * FROM recent_audit_activity LIMIT 10;
-- SELECT * FROM active_user_sessions;
-- SELECT * FROM failed_transaction_summary;
