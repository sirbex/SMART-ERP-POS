-- Migration: Comprehensive RBAC role & permission fix
-- Date: 2026-04-07
-- Description:
--   1. Adds ALL missing permissions to catalog (banking, delivery, settings, inventory.manage, crm, hr)
--   2. Fixes system role permission counts to match the full catalog
--   3. Adds new system roles: Accountant, Warehouse Clerk, Sales Representative
--   4. Removes stale custom roles that duplicate system roles
-- Fully idempotent — safe to re-run.

BEGIN;

-- =============================================================================
-- 1. ENSURE ALL PERMISSIONS EXIST IN CATALOG
--    (base 60 already exist; adds banking, delivery, settings, inventory.manage,
--     crm, hr, and sales.refund if missing)
-- =============================================================================

INSERT INTO rbac_permissions_catalog (key, module, action, description) VALUES
  -- Banking (7)
  ('banking.read',      'banking', 'read',      'View bank accounts and transactions'),
  ('banking.create',    'banking', 'create',    'Create bank accounts and transactions'),
  ('banking.update',    'banking', 'update',    'Update bank accounts and transaction details'),
  ('banking.delete',    'banking', 'delete',    'Delete or reverse bank transactions'),
  ('banking.reconcile', 'banking', 'reconcile', 'Reconcile bank transactions'),
  ('banking.import',    'banking', 'import',    'Import bank statements'),
  ('banking.export',    'banking', 'export',    'Export banking data'),

  -- Delivery (4)
  ('delivery.read',   'delivery', 'read',   'View delivery orders and routes'),
  ('delivery.create', 'delivery', 'create', 'Create delivery orders and routes'),
  ('delivery.update', 'delivery', 'update', 'Update delivery status and assign drivers'),
  ('delivery.delete', 'delivery', 'delete', 'Delete delivery orders'),

  -- Settings (2)
  ('settings.read',   'settings', 'read',   'View system settings'),
  ('settings.update', 'settings', 'update', 'Update system settings'),

  -- Inventory extended (1)
  ('inventory.manage', 'inventory', 'manage', 'Manage physical stock counts and adjustments'),

  -- Sales extended (1)
  ('sales.refund', 'sales', 'refund', 'Refund completed sales'),

  -- CRM (5)
  ('crm.read',   'crm', 'read',   'View CRM data (leads, opportunities, activities)'),
  ('crm.create', 'crm', 'create', 'Create leads and opportunities'),
  ('crm.update', 'crm', 'update', 'Modify CRM records'),
  ('crm.delete', 'crm', 'delete', 'Delete CRM records'),
  ('crm.manage', 'crm', 'manage', 'Manage opportunity pipeline'),

  -- HR & Payroll (6)
  ('hr.read',            'hr', 'read',            'View HR data (employees, departments, positions, payroll)'),
  ('hr.create',          'hr', 'create',          'Create employees, departments, positions, payroll periods'),
  ('hr.update',          'hr', 'update',          'Modify HR records'),
  ('hr.delete',          'hr', 'delete',          'Delete HR records'),
  ('hr.payroll_process', 'hr', 'payroll_process', 'Process payroll (calculate entries)'),
  ('hr.payroll_post',    'hr', 'payroll_post',    'Post payroll to General Ledger')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. FIX ALL SYSTEM ROLE PERMISSIONS
--    Delete-and-reinsert is the safest approach for system roles because the
--    role definitions are fully declarative.  Custom roles are NOT touched.
-- =============================================================================

DO $$
DECLARE
  sys UUID := '00000000-0000-0000-0000-000000000001';
  rid UUID;
BEGIN

  -- -------------------------------------------------------
  -- 2a. SUPER ADMINISTRATOR  — every permission in catalog
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Super Administrator' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    DELETE FROM rbac_role_permissions WHERE role_id = rid;
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog;
  END IF;

  -- -------------------------------------------------------
  -- 2b. ADMINISTRATOR  — system.* + admin.* + reports.* + settings.* + every .read
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Administrator' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    DELETE FROM rbac_role_permissions WHERE role_id = rid;
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE module IN ('system', 'admin', 'reports', 'settings')
       OR action = 'read';
  END IF;

  -- -------------------------------------------------------
  -- 2c. MANAGER  — operational modules (everything except system, admin, hr)
  --     sales(8) + inventory(8) + pos(4) + purchasing(6) + customers(5) +
  --     suppliers(4) + reports(3) + banking(7) + delivery(4) + settings(2) + crm(5)
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Manager' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    DELETE FROM rbac_role_permissions WHERE role_id = rid;
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE module IN (
      'sales', 'inventory', 'purchasing', 'customers', 'suppliers',
      'reports', 'pos', 'banking', 'delivery', 'settings', 'crm'
    );
  END IF;

  -- -------------------------------------------------------
  -- 2d. CASHIER  — minimal POS floor operations
  --     pos.read, pos.create, sales.read, sales.create,
  --     customers.read, customers.create, inventory.read,
  --     delivery.read, settings.read
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Cashier' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    DELETE FROM rbac_role_permissions WHERE role_id = rid;
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key IN (
      'pos.read', 'pos.create',
      'sales.read', 'sales.create',
      'customers.read', 'customers.create',
      'inventory.read',
      'delivery.read',
      'settings.read'
    );
  END IF;

  -- -------------------------------------------------------
  -- 2e. AUDITOR  — every .read permission across all modules
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Auditor' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    DELETE FROM rbac_role_permissions WHERE role_id = rid;
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE action = 'read';
  END IF;

  -- -------------------------------------------------------
  -- 3. NEW SYSTEM ROLES
  -- -------------------------------------------------------

  -- 3a. ACCOUNTANT
  --     Full accounting + banking + reports + read-only on sales/purchasing/customers/suppliers/inventory
  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Accountant', 'Financial operations - accounting, banking, and reporting', true, sys, sys)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_system_role = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  RETURNING id INTO rid;

  DELETE FROM rbac_role_permissions WHERE role_id = rid;
  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  WHERE module IN ('accounting', 'banking', 'reports')
     OR key IN (
       'sales.read', 'sales.export',
       'purchasing.read',
       'customers.read', 'customers.export',
       'suppliers.read',
       'inventory.read',
       'settings.read'
     );

  -- 3b. WAREHOUSE CLERK
  --     Inventory management + purchasing/delivery read + goods receipt
  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Warehouse Clerk', 'Inventory and warehouse operations - receiving, stock counts, deliveries', true, sys, sys)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_system_role = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  RETURNING id INTO rid;

  DELETE FROM rbac_role_permissions WHERE role_id = rid;
  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  WHERE module IN ('inventory', 'delivery')
     OR key IN (
       'purchasing.read', 'purchasing.post',
       'suppliers.read',
       'settings.read',
       'reports.read'
     );

  -- 3c. SALES REPRESENTATIVE
  --     Sales + customers + CRM + POS read + inventory read + reports
  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('Sales Representative', 'Sales operations - sales, customers, CRM, and quotations', true, sys, sys)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_system_role = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  RETURNING id INTO rid;

  DELETE FROM rbac_role_permissions WHERE role_id = rid;
  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  WHERE module IN ('sales', 'customers', 'crm', 'reports')
     OR key IN (
       'pos.read', 'pos.create',
       'inventory.read',
       'delivery.read',
       'settings.read'
     );

  -- 3d. HR MANAGER
  --     Full HR/Payroll + reports + employee read
  INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
  VALUES ('HR Manager', 'Human resources and payroll management', true, sys, sys)
  ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_system_role = true,
    updated_by = EXCLUDED.updated_by,
    updated_at = NOW()
  RETURNING id INTO rid;

  DELETE FROM rbac_role_permissions WHERE role_id = rid;
  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  WHERE module IN ('hr', 'reports')
     OR key IN (
       'settings.read',
       'accounting.read'
     );

END $$;

-- =============================================================================
-- 4. CLEAN UP STALE CUSTOM ROLES
--    The custom 'accounts' and lowercase 'manager' roles were manually created
--    and are now superseded by proper system roles (Accountant, Manager).
--    Reassign any users on those custom roles before deleting.
-- =============================================================================

DO $$
DECLARE
  sys UUID := '00000000-0000-0000-0000-000000000001';
  custom_role_id UUID;
  system_role_id UUID;
  u_id UUID;
BEGIN
  -- Migrate custom 'accounts' → system 'Accountant'
  SELECT id INTO custom_role_id FROM rbac_roles WHERE name = 'accounts' AND is_system_role = false;
  SELECT id INTO system_role_id FROM rbac_roles WHERE name = 'Accountant' AND is_system_role = true;
  IF custom_role_id IS NOT NULL AND system_role_id IS NOT NULL THEN
    FOR u_id IN SELECT user_id FROM rbac_user_roles WHERE role_id = custom_role_id
    LOOP
      INSERT INTO rbac_user_roles (user_id, role_id, assigned_by)
      VALUES (u_id, system_role_id, sys)
      ON CONFLICT (user_id, role_id, COALESCE(scope_type, ''), COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')) DO NOTHING;
    END LOOP;
    DELETE FROM rbac_user_roles WHERE role_id = custom_role_id;
    DELETE FROM rbac_roles WHERE id = custom_role_id;
  END IF;

  -- Migrate custom 'manager' (lowercase) → system 'Manager'
  SELECT id INTO custom_role_id FROM rbac_roles WHERE name = 'manager' AND is_system_role = false;
  SELECT id INTO system_role_id FROM rbac_roles WHERE name = 'Manager' AND is_system_role = true;
  IF custom_role_id IS NOT NULL AND system_role_id IS NOT NULL THEN
    FOR u_id IN SELECT user_id FROM rbac_user_roles WHERE role_id = custom_role_id
    LOOP
      INSERT INTO rbac_user_roles (user_id, role_id, assigned_by)
      VALUES (u_id, system_role_id, sys)
      ON CONFLICT (user_id, role_id, COALESCE(scope_type, ''), COALESCE(scope_id, '00000000-0000-0000-0000-000000000000')) DO NOTHING;
    END LOOP;
    DELETE FROM rbac_user_roles WHERE role_id = custom_role_id;
    DELETE FROM rbac_roles WHERE id = custom_role_id;
  END IF;
END $$;

COMMIT;
