-- ============================================================================
-- REMEDIATION AUDIT LOG TABLE
-- Date: 2025-12-29
-- Purpose: Log failures that require manual remediation
-- 
-- When trigger/service failures cannot be retried automatically,
-- they are logged here for manual review and correction.
-- ============================================================================

BEGIN;

-- Create remediation audit log table
CREATE TABLE IF NOT EXISTS remediation_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- When the failure occurred
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Classification
    severity TEXT NOT NULL CHECK (severity IN ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')),
    category TEXT NOT NULL CHECK (category IN (
        'GL_POSTING',           -- General ledger posting failures
        'AR_SYNC',              -- Accounts receivable sync failures
        'AP_SYNC',              -- Accounts payable sync failures
        'INVENTORY_SYNC',       -- Inventory quantity sync failures
        'BALANCE_MISMATCH',     -- Balance reconciliation issues
        'ORPHANED_RECORD',      -- Records missing related data
        'CONSTRAINT_VIOLATION', -- Data integrity issues
        'OTHER'
    )),
    
    -- What failed
    operation TEXT NOT NULL,           -- e.g., 'post_sale_to_ledger'
    error_message TEXT NOT NULL,       -- Full error message
    error_code TEXT,                   -- PostgreSQL error code if available
    
    -- Context for remediation
    entity_type TEXT NOT NULL,         -- e.g., 'SALE', 'INVOICE', 'GOODS_RECEIPT'
    entity_id TEXT NOT NULL,           -- UUID or business ID of affected record
    entity_reference TEXT,             -- Human-readable reference (e.g., SALE-2025-0001)
    
    -- Remediation tracking
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
        'PENDING',      -- Awaiting review
        'IN_PROGRESS',  -- Being worked on
        'RESOLVED',     -- Fixed
        'IGNORED',      -- Determined not actionable
        'ESCALATED'     -- Needs higher authority
    )),
    
    -- Resolution details
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,                  -- User who resolved
    resolution_notes TEXT,             -- What was done to fix
    
    -- Additional context (JSON for flexibility)
    context JSONB DEFAULT '{}',
    
    -- Prevent duplicates for same entity/operation
    CONSTRAINT uq_remediation_entity_operation UNIQUE (entity_type, entity_id, operation, created_at)
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_remediation_status 
ON remediation_audit_log(status) WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_remediation_severity 
ON remediation_audit_log(severity, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_remediation_entity 
ON remediation_audit_log(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_remediation_created 
ON remediation_audit_log(created_at DESC);

-- ============================================================================
-- HELPER FUNCTION: Log a remediation item
-- ============================================================================

CREATE OR REPLACE FUNCTION log_remediation(
    p_severity TEXT,
    p_category TEXT,
    p_operation TEXT,
    p_error_message TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_entity_reference TEXT DEFAULT NULL,
    p_context JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO remediation_audit_log (
        severity, category, operation, error_message,
        entity_type, entity_id, entity_reference, context
    ) VALUES (
        p_severity, p_category, p_operation, p_error_message,
        p_entity_type, p_entity_id, p_entity_reference, p_context
    )
    RETURNING id INTO v_id;
    
    -- Also raise a warning so it appears in logs
    RAISE WARNING 'REMEDIATION REQUIRED [%]: % - % (Entity: % %)', 
        p_severity, p_category, p_operation, p_entity_type, p_entity_id;
    
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- HELPER FUNCTION: Resolve a remediation item
-- ============================================================================

CREATE OR REPLACE FUNCTION resolve_remediation(
    p_id UUID,
    p_resolved_by TEXT,
    p_resolution_notes TEXT,
    p_status TEXT DEFAULT 'RESOLVED'
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE remediation_audit_log
    SET status = p_status,
        resolved_at = CURRENT_TIMESTAMP,
        resolved_by = p_resolved_by,
        resolution_notes = p_resolution_notes
    WHERE id = p_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW: Pending remediations dashboard
-- ============================================================================

CREATE OR REPLACE VIEW v_pending_remediations AS
SELECT 
    id,
    created_at,
    severity,
    category,
    operation,
    SUBSTRING(error_message, 1, 100) || 
        CASE WHEN LENGTH(error_message) > 100 THEN '...' ELSE '' END AS error_preview,
    entity_type,
    entity_reference,
    EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - created_at))/3600 AS hours_pending
FROM remediation_audit_log
WHERE status = 'PENDING'
ORDER BY 
    CASE severity 
        WHEN 'CRITICAL' THEN 1
        WHEN 'HIGH' THEN 2
        WHEN 'MEDIUM' THEN 3
        WHEN 'LOW' THEN 4
    END,
    created_at ASC;

-- ============================================================================
-- VERIFICATION
-- ============================================================================

SELECT 'Remediation audit log table created' AS status;

-- Show table structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'remediation_audit_log'
ORDER BY ordinal_position;

COMMIT;
