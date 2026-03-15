-- Migration: Add banking, delivery, settings, and inventory.manage permissions
-- Date: 2026-03-16
-- Description: Adds 16 new permissions for banking, delivery, settings modules
--              and inventory.manage for stock count operations.
--              Also assigns permissions to appropriate system roles.

BEGIN;

-- =============================================================================
-- 1. INSERT NEW PERMISSIONS INTO CATALOG
-- =============================================================================

INSERT INTO rbac_permissions_catalog (key, module, action, description) VALUES
  -- Banking module (7 permissions)
  ('banking.read', 'banking', 'read', 'View bank accounts and transactions'),
  ('banking.create', 'banking', 'create', 'Create bank accounts and transactions'),
  ('banking.update', 'banking', 'update', 'Update bank accounts and transaction details'),
  ('banking.delete', 'banking', 'delete', 'Delete or reverse bank transactions'),
  ('banking.reconcile', 'banking', 'reconcile', 'Reconcile bank transactions'),
  ('banking.import', 'banking', 'import', 'Import bank statements'),
  ('banking.export', 'banking', 'export', 'Export banking data'),

  -- Delivery module (4 permissions)
  ('delivery.read', 'delivery', 'read', 'View delivery orders and routes'),
  ('delivery.create', 'delivery', 'create', 'Create delivery orders and routes'),
  ('delivery.update', 'delivery', 'update', 'Update delivery status and assign drivers'),
  ('delivery.delete', 'delivery', 'delete', 'Delete delivery orders'),

  -- Settings module (2 permissions)
  ('settings.read', 'settings', 'read', 'View system settings'),
  ('settings.update', 'settings', 'update', 'Update system settings'),

  -- Inventory extended (1 permission)
  ('inventory.manage', 'inventory', 'manage', 'Manage physical stock counts and adjustments')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. ASSIGN NEW PERMISSIONS TO SYSTEM ROLES
-- =============================================================================

DO $$
DECLARE
  system_user_id UUID := '00000000-0000-0000-0000-000000000001';
  super_admin_id UUID;
  manager_id UUID;
  cashier_id UUID;
  auditor_id UUID;
BEGIN
  -- Get existing role IDs
  SELECT id INTO super_admin_id FROM rbac_roles WHERE name = 'Super Administrator';
  SELECT id INTO manager_id FROM rbac_roles WHERE name = 'Manager';
  SELECT id INTO cashier_id FROM rbac_roles WHERE name = 'Cashier';
  SELECT id INTO auditor_id FROM rbac_roles WHERE name = 'Auditor';

  -- Super Admin gets ALL new permissions
  IF super_admin_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT super_admin_id, key, system_user_id FROM rbac_permissions_catalog
    WHERE module IN ('banking', 'delivery', 'settings') OR key = 'inventory.manage'
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;

  -- Manager gets banking, delivery, settings, and inventory.manage permissions
  IF manager_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT manager_id, key, system_user_id FROM rbac_permissions_catalog
    WHERE module IN ('banking', 'delivery', 'settings') OR key = 'inventory.manage'
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;

  -- Cashier gets delivery.read and settings.read
  IF cashier_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT cashier_id, key, system_user_id FROM rbac_permissions_catalog
    WHERE key IN ('delivery.read', 'settings.read')
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;

  -- Auditor gets all new .read permissions
  IF auditor_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT auditor_id, key, system_user_id FROM rbac_permissions_catalog
    WHERE action = 'read' AND module IN ('banking', 'delivery', 'settings')
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;
END $$;

COMMIT;
