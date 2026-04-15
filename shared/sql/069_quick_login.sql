-- Migration 069: SAP-Style Quick Login for POS
-- Adds PIN/biometric quick login capability for shared POS terminals
-- Date: 2026-04-15

-- ============================================================
-- 1. Add quick login fields to users table
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS quick_login_enabled BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS webauthn_credential_id VARCHAR(512);
ALTER TABLE users ADD COLUMN IF NOT EXISTS webauthn_public_key TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_quick_login_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_users_quick_login_enabled
  ON users (quick_login_enabled) WHERE quick_login_enabled = true;

-- ============================================================
-- 2. Trusted devices table
-- ============================================================
CREATE TABLE IF NOT EXISTS trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_fingerprint VARCHAR(512) UNIQUE NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  location_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  registered_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_fingerprint
  ON trusted_devices (device_fingerprint) WHERE is_active = true;

-- ============================================================
-- 3. Quick login audit table
-- ============================================================
CREATE TABLE IF NOT EXISTS quick_login_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  user_name VARCHAR(255) NOT NULL,
  device_fingerprint VARCHAR(512) NOT NULL,
  method VARCHAR(20) NOT NULL CHECK (method IN ('PIN', 'BIOMETRIC')),
  success BOOLEAN NOT NULL,
  failure_reason VARCHAR(255),
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_quick_login_audit_user_id ON quick_login_audit (user_id);
CREATE INDEX IF NOT EXISTS idx_quick_login_audit_device ON quick_login_audit (device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_quick_login_audit_created ON quick_login_audit (created_at);

-- ============================================================
-- 4. PIN attempt tracking (rate limiting)
-- ============================================================
CREATE TABLE IF NOT EXISTS pin_attempts (
  user_id UUID NOT NULL REFERENCES users(id),
  failed_attempts INT DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  locked_until TIMESTAMPTZ,
  PRIMARY KEY (user_id)
);

-- ============================================================
-- 5. Bump schema version so tenant auto-migration detects this
-- ============================================================
INSERT INTO schema_version (version) VALUES (2)
ON CONFLICT DO NOTHING;
