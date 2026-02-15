BEGIN;

CREATE TABLE IF NOT EXISTS rbac_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_by UUID NOT NULL,
  CONSTRAINT rbac_roles_name_unique UNIQUE (name)
);

CREATE INDEX IF NOT EXISTS idx_rbac_roles_name ON rbac_roles (LOWER(name));
CREATE INDEX IF NOT EXISTS idx_rbac_roles_is_active ON rbac_roles (is_active);

CREATE TABLE IF NOT EXISTS rbac_role_permissions (
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  permission_key VARCHAR(100) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  granted_by UUID NOT NULL,
  PRIMARY KEY (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_rbac_role_permissions_key ON rbac_role_permissions (permission_key);

CREATE TABLE IF NOT EXISTS rbac_user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role_id UUID NOT NULL REFERENCES rbac_roles(id) ON DELETE CASCADE,
  scope_type VARCHAR(20) CHECK (scope_type IN ('global', 'organization', 'branch', 'warehouse')),
  scope_id UUID,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID NOT NULL,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rbac_user_roles_unique ON rbac_user_roles (
  user_id,
  role_id,
  COALESCE(scope_type, ''),
  COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')
);

CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_user_id ON rbac_user_roles (user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_role_id ON rbac_user_roles (role_id);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_active ON rbac_user_roles (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_rbac_user_roles_expires ON rbac_user_roles (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS rbac_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL,
  target_user_id UUID,
  target_role_id UUID,
  action VARCHAR(50) NOT NULL CHECK (action IN (
    'role_created',
    'role_updated',
    'role_deleted',
    'role_permissions_updated',
    'user_role_assigned',
    'user_role_removed',
    'user_role_expired',
    'permission_denied',
    'permission_granted'
  )),
  previous_state JSONB,
  new_state JSONB,
  ip_address VARCHAR(45),
  user_agent TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_actor ON rbac_audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_target_user ON rbac_audit_logs (target_user_id) WHERE target_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_target_role ON rbac_audit_logs (target_role_id) WHERE target_role_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_action ON rbac_audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_logs_timestamp ON rbac_audit_logs (timestamp DESC);

CREATE TABLE IF NOT EXISTS rbac_permissions_catalog (
  key VARCHAR(100) PRIMARY KEY,
  module VARCHAR(50) NOT NULL,
  action VARCHAR(20) NOT NULL,
  description VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO rbac_permissions_catalog (key, module, action, description) VALUES
  ('sales.read', 'sales', 'read', 'View sales transactions'),
  ('sales.create', 'sales', 'create', 'Create new sales'),
  ('sales.update', 'sales', 'update', 'Modify existing sales'),
  ('sales.delete', 'sales', 'delete', 'Delete sales transactions'),
  ('sales.void', 'sales', 'void', 'Void completed sales'),
  ('sales.export', 'sales', 'export', 'Export sales data'),
  ('sales.approve', 'sales', 'approve', 'Approve sales requiring authorization'),
  ('inventory.read', 'inventory', 'read', 'View inventory levels'),
  ('inventory.create', 'inventory', 'create', 'Create inventory items'),
  ('inventory.update', 'inventory', 'update', 'Modify inventory items'),
  ('inventory.delete', 'inventory', 'delete', 'Delete inventory items'),
  ('inventory.import', 'inventory', 'import', 'Import inventory data'),
  ('inventory.export', 'inventory', 'export', 'Export inventory data'),
  ('inventory.approve', 'inventory', 'approve', 'Approve stock adjustments'),
  ('pos.read', 'pos', 'read', 'Access point of sale'),
  ('pos.create', 'pos', 'create', 'Process transactions'),
  ('pos.void', 'pos', 'void', 'Void POS transactions'),
  ('pos.approve', 'pos', 'approve', 'Approve POS overrides'),
  ('purchasing.read', 'purchasing', 'read', 'View purchase orders'),
  ('purchasing.create', 'purchasing', 'create', 'Create purchase orders'),
  ('purchasing.update', 'purchasing', 'update', 'Modify purchase orders'),
  ('purchasing.delete', 'purchasing', 'delete', 'Delete purchase orders'),
  ('purchasing.approve', 'purchasing', 'approve', 'Approve purchase orders'),
  ('purchasing.post', 'purchasing', 'post', 'Post goods receipts'),
  ('customers.read', 'customers', 'read', 'View customers'),
  ('customers.create', 'customers', 'create', 'Create customers'),
  ('customers.update', 'customers', 'update', 'Modify customers'),
  ('customers.delete', 'customers', 'delete', 'Delete customers'),
  ('customers.export', 'customers', 'export', 'Export customer data'),
  ('suppliers.read', 'suppliers', 'read', 'View suppliers'),
  ('suppliers.create', 'suppliers', 'create', 'Create suppliers'),
  ('suppliers.update', 'suppliers', 'update', 'Modify suppliers'),
  ('suppliers.delete', 'suppliers', 'delete', 'Delete suppliers'),
  ('accounting.read', 'accounting', 'read', 'View accounting data'),
  ('accounting.create', 'accounting', 'create', 'Create journal entries'),
  ('accounting.update', 'accounting', 'update', 'Modify accounting records'),
  ('accounting.delete', 'accounting', 'delete', 'Delete accounting records'),
  ('accounting.post', 'accounting', 'post', 'Post journal entries'),
  ('accounting.approve', 'accounting', 'approve', 'Approve accounting transactions'),
  ('accounting.void', 'accounting', 'void', 'Void posted entries'),
  ('accounting.export', 'accounting', 'export', 'Export accounting data'),
  ('reports.read', 'reports', 'read', 'View reports'),
  ('reports.create', 'reports', 'create', 'Create custom reports'),
  ('reports.export', 'reports', 'export', 'Export reports'),
  ('admin.read', 'admin', 'read', 'View admin panel'),
  ('admin.create', 'admin', 'create', 'Create admin resources'),
  ('admin.update', 'admin', 'update', 'Modify admin settings'),
  ('admin.delete', 'admin', 'delete', 'Delete admin resources'),
  ('system.read', 'system', 'read', 'View system configuration'),
  ('system.update', 'system', 'update', 'Modify system settings'),
  ('system.audit_read', 'system', 'read', 'View audit logs'),
  ('system.users_read', 'system', 'read', 'View users'),
  ('system.users_create', 'system', 'create', 'Create users'),
  ('system.users_update', 'system', 'update', 'Modify users'),
  ('system.users_delete', 'system', 'delete', 'Delete users'),
  ('system.roles_read', 'system', 'read', 'View roles'),
  ('system.roles_create', 'system', 'create', 'Create roles'),
  ('system.roles_update', 'system', 'update', 'Modify roles'),
  ('system.roles_delete', 'system', 'delete', 'Delete roles'),
  ('system.permissions_read', 'system', 'read', 'View permissions catalog')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
  super_admin_id UUID;
  admin_id UUID;
  manager_id UUID;
  cashier_id UUID;
  auditor_id UUID;
BEGIN
  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Super Administrator', 'Full system access - all permissions', true, system_user_id, system_user_id)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO super_admin_id;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT super_admin_id, key, system_user_id FROM rbac_permissions_catalog
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Administrator', 'Administrative access - user and role management', true, system_user_id, system_user_id)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO admin_id;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT admin_id, key, system_user_id FROM rbac_permissions_catalog
  WHERE module IN ('system', 'admin', 'reports') OR action = 'read'
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Manager', 'Operational management - sales, inventory, purchasing', true, system_user_id, system_user_id)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO manager_id;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT manager_id, key, system_user_id FROM rbac_permissions_catalog
  WHERE module IN ('sales', 'inventory', 'purchasing', 'customers', 'suppliers', 'reports', 'pos')
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Cashier', 'Point of sale operations', true, system_user_id, system_user_id)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO cashier_id;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT cashier_id, key, system_user_id FROM rbac_permissions_catalog
  WHERE key IN ('pos.read', 'pos.create', 'sales.read', 'sales.create', 'customers.read', 'inventory.read')
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Auditor', 'Read-only access for auditing purposes', true, system_user_id, system_user_id)
  ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
  RETURNING id INTO auditor_id;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT auditor_id, key, system_user_id FROM rbac_permissions_catalog
  WHERE action = 'read'
  ON CONFLICT (role_id, permission_key) DO NOTHING;
END $$;

COMMIT;
