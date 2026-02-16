-- ============================================================
-- MULTI-TENANT SaaS INFRASTRUCTURE
-- Migration: 400_multi_tenant.sql
-- Created: February 2026
-- Purpose: Database-per-Tenant registry in master database
-- ============================================================

-- This migration runs against the MASTER database (pos_system)
-- Each tenant gets their own database provisioned via the API

-- Tenant Registry: tracks all tenant databases
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(63) UNIQUE NOT NULL,           -- subdomain / identifier (e.g., 'acme-shop')
    name VARCHAR(255) NOT NULL,                 -- display name (e.g., 'Acme Shop Ltd')
    database_name VARCHAR(63) UNIQUE NOT NULL,  -- PostgreSQL database name (e.g., 'pos_tenant_acme_shop')
    database_host VARCHAR(255) NOT NULL DEFAULT 'localhost',
    database_port INTEGER NOT NULL DEFAULT 5432,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'PROVISIONING', 'DEACTIVATED')),
    plan VARCHAR(30) NOT NULL DEFAULT 'FREE'
        CHECK (plan IN ('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
    
    -- Billing
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    billing_email VARCHAR(255),
    
    -- Limits (enforced by middleware)
    max_users INTEGER NOT NULL DEFAULT 3,
    max_products INTEGER NOT NULL DEFAULT 500,
    max_locations INTEGER NOT NULL DEFAULT 1,
    storage_limit_mb INTEGER NOT NULL DEFAULT 500,
    
    -- Metadata
    owner_user_id UUID,                         -- user ID within the tenant DB (not FK - cross-db)
    country VARCHAR(3) DEFAULT 'UG',
    currency VARCHAR(3) DEFAULT 'UGX',
    timezone VARCHAR(50) DEFAULT 'Africa/Kampala',
    custom_domain VARCHAR(255),
    
    -- Edge / On-Premises sync
    edge_enabled BOOLEAN NOT NULL DEFAULT false,
    last_sync_at TIMESTAMPTZ,
    sync_status VARCHAR(20) DEFAULT 'IDLE'
        CHECK (sync_status IN ('IDLE', 'SYNCING', 'ERROR', 'OFFLINE')),
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deactivated_at TIMESTAMPTZ
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenants_slug ON tenants(slug);
CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX IF NOT EXISTS idx_tenants_custom_domain ON tenants(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenants_stripe_customer ON tenants(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

-- Tenant API Keys: for edge nodes and external integrations
CREATE TABLE IF NOT EXISTS tenant_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL,             -- bcrypt hash of the API key
    key_prefix VARCHAR(8) NOT NULL,             -- first 8 chars for identification (e.g., 'sk_live_')
    name VARCHAR(100) NOT NULL,                 -- human-readable name (e.g., 'Store A Edge Node')
    scopes TEXT[] NOT NULL DEFAULT '{sync}',     -- permitted scopes: sync, read, write, admin
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_tenant ON tenant_api_keys(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_api_keys_prefix ON tenant_api_keys(key_prefix);

-- Sync Ledger: tracks what has been synced to/from edge nodes
CREATE TABLE IF NOT EXISTS sync_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    edge_node_id VARCHAR(100) NOT NULL,         -- identifier for the specific edge location
    entity_type VARCHAR(50) NOT NULL,           -- 'sale', 'product', 'customer', 'inventory', etc.
    entity_id UUID NOT NULL,                    -- ID of the record
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('UP', 'DOWN')),  -- UP = edge→cloud, DOWN = cloud→edge
    sync_version BIGINT NOT NULL DEFAULT 1,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'SYNCED', 'CONFLICT', 'FAILED')),
    payload JSONB,                              -- the actual data being synced
    conflict_data JSONB,                        -- if conflict, stores both versions
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_ledger_tenant_status ON sync_ledger(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_sync_ledger_entity ON sync_ledger(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_sync_ledger_edge_node ON sync_ledger(tenant_id, edge_node_id);

-- Tenant Audit Log: tracks tenant lifecycle events
CREATE TABLE IF NOT EXISTS tenant_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL,                -- 'CREATED', 'ACTIVATED', 'SUSPENDED', 'PLAN_CHANGED', etc.
    actor VARCHAR(255),                         -- who performed the action (super-admin email or 'SYSTEM')
    details JSONB,                              -- additional context
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_audit_tenant ON tenant_audit_log(tenant_id);

-- Billing Events: tracks usage for metered billing
CREATE TABLE IF NOT EXISTS billing_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,            -- 'SALE_COMPLETED', 'USER_ADDED', 'STORAGE_USED'
    quantity INTEGER NOT NULL DEFAULT 1,
    metadata JSONB,
    billing_period DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_events_tenant_period ON billing_events(tenant_id, billing_period);

-- Super Admin users (platform-level, not per-tenant)
CREATE TABLE IF NOT EXISTS super_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_tenant_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION update_tenant_updated_at();

-- Insert a default tenant for the current pos_system database (backward compatible)
INSERT INTO tenants (slug, name, database_name, status, plan, max_users, max_products, max_locations)
VALUES ('default', 'Default Tenant (Local)', 'pos_system', 'ACTIVE', 'ENTERPRISE', 999, 999999, 999)
ON CONFLICT (slug) DO NOTHING;
