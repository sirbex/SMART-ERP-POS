-- Phase 7: Security Database Schema Enhancement
-- File: database/migrations/002_security_enhancements.sql

-- Add refresh tokens table for JWT management
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_revoked BOOLEAN DEFAULT false,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(token)
);

-- Create index on refresh tokens for performance
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);

-- Add security columns to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS two_factor_secret TEXT;

-- Create audit logs table for security monitoring
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(255) NOT NULL,
    details JSONB,
    ip_address INET,
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes on audit logs for performance
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_success ON audit_logs(success);

-- Create API keys table for service-to-service authentication
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    permissions JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);

-- Create session storage table for session management
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes on sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Create security events table for monitoring suspicious activities
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'LOW',
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address INET,
    user_agent TEXT,
    details JSONB,
    resolved BOOLEAN DEFAULT false,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes on security events
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON security_events(event_type);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at);
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);

-- Create rate limiting table for IP-based rate limiting
CREATE TABLE IF NOT EXISTS rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address INET NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    request_count INTEGER DEFAULT 1,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(ip_address, endpoint, window_start)
);

-- Create indexes on rate limits
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint ON rate_limits(ip_address, endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_end ON rate_limits(window_end);

-- Add constraints and checks
ALTER TABLE users 
ADD CONSTRAINT check_failed_login_attempts CHECK (failed_login_attempts >= 0),
ADD CONSTRAINT check_locked_until_future CHECK (locked_until > NOW() OR locked_until IS NULL);

ALTER TABLE audit_logs 
ADD CONSTRAINT check_audit_action_not_empty CHECK (action != ''),
ADD CONSTRAINT check_audit_resource_not_empty CHECK (resource != '');

ALTER TABLE security_events 
ADD CONSTRAINT check_security_event_type_not_empty CHECK (event_type != ''),
ADD CONSTRAINT check_security_severity_valid CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

-- Function to automatically clean up expired tokens and sessions
CREATE OR REPLACE FUNCTION cleanup_expired_security_data()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER := 0;
BEGIN
    -- Delete expired refresh tokens
    DELETE FROM refresh_tokens 
    WHERE expires_at < NOW() OR (is_revoked = true AND revoked_at < NOW() - INTERVAL '30 days');
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    -- Delete expired sessions
    DELETE FROM user_sessions 
    WHERE expires_at < NOW();
    
    -- Delete old rate limit records (older than 1 day)
    DELETE FROM rate_limits 
    WHERE window_end < NOW() - INTERVAL '1 day';
    
    -- Delete old audit logs (older than 1 year) except for critical events
    DELETE FROM audit_logs 
    WHERE created_at < NOW() - INTERVAL '1 year' 
    AND NOT (details->>'severity' = 'CRITICAL');
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to log security events
CREATE OR REPLACE FUNCTION log_security_event(
    p_event_type VARCHAR(50),
    p_severity VARCHAR(20) DEFAULT 'LOW',
    p_user_id UUID DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_details JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO security_events (
        event_type, severity, user_id, ip_address, user_agent, details
    ) VALUES (
        p_event_type, p_severity, p_user_id, p_ip_address, p_user_agent, p_details
    ) RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to check and increment rate limiting
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_ip_address INET,
    p_endpoint VARCHAR(255),
    p_window_minutes INTEGER DEFAULT 15,
    p_max_requests INTEGER DEFAULT 100
)
RETURNS BOOLEAN AS $$
DECLARE
    current_window_start TIMESTAMPTZ;
    current_window_end TIMESTAMPTZ;
    current_count INTEGER;
BEGIN
    -- Calculate current window
    current_window_start := date_trunc('minute', NOW()) - 
                           (EXTRACT(MINUTE FROM NOW())::INTEGER % p_window_minutes) * INTERVAL '1 minute';
    current_window_end := current_window_start + (p_window_minutes || ' minutes')::INTERVAL;
    
    -- Get or create rate limit record
    INSERT INTO rate_limits (ip_address, endpoint, window_start, window_end, request_count)
    VALUES (p_ip_address, p_endpoint, current_window_start, current_window_end, 1)
    ON CONFLICT (ip_address, endpoint, window_start) 
    DO UPDATE SET 
        request_count = rate_limits.request_count + 1,
        updated_at = NOW()
    RETURNING request_count INTO current_count;
    
    -- Return true if within limit, false if exceeded
    RETURN current_count <= p_max_requests;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update password_changed_at when password is changed
CREATE OR REPLACE FUNCTION update_password_changed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.password_hash != NEW.password_hash THEN
        NEW.password_changed_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_password_changed 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_password_changed_at();

-- Create a view for active user sessions
CREATE OR REPLACE VIEW active_user_sessions AS
SELECT 
    us.id,
    us.user_id,
    u.username,
    u.email,
    us.ip_address,
    us.user_agent,
    us.created_at,
    us.updated_at,
    us.expires_at
FROM user_sessions us
JOIN users u ON us.user_id = u.id
WHERE us.is_active = true 
  AND us.expires_at > NOW();

-- Create a view for security event summary
CREATE OR REPLACE VIEW security_event_summary AS
SELECT 
    event_type,
    severity,
    COUNT(*) as event_count,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as last_24h_count,
    COUNT(CASE WHEN resolved = false THEN 1 END) as unresolved_count,
    MAX(created_at) as latest_event
FROM security_events
GROUP BY event_type, severity
ORDER BY severity DESC, event_count DESC;

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_tokens TO pos_api_user;
-- GRANT SELECT, INSERT, UPDATE ON audit_logs TO pos_api_user;
-- GRANT SELECT, INSERT, UPDATE ON security_events TO pos_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON user_sessions TO pos_api_user;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON rate_limits TO pos_api_user;
-- GRANT SELECT, INSERT, UPDATE ON api_keys TO pos_api_user;