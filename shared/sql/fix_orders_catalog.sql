-- Fix: Add missing 'orders' module to rbac_permissions_catalog and re-apply role permissions
-- Root cause: orders.read/create/pay/cancel were defined in code (permissions.ts) but never
-- seeded into the database catalog. This prevented RBAC role assignments.
-- Safe to run multiple times (ON CONFLICT DO NOTHING + idempotent re-insert).
-- Run on BOTH databases: pos_system AND pos_tenant_henber_pharmacy

BEGIN;

-- =============================================================================
-- 1. ADD MISSING ORDERS PERMISSIONS TO CATALOG
-- =============================================================================
INSERT INTO rbac_permissions_catalog (key, module, action, description) VALUES
  ('orders.read',   'orders', 'read',   'View POS orders queue'),
  ('orders.create', 'orders', 'create', 'Create POS orders (dispenser)'),
  ('orders.pay',    'orders', 'pay',    'Complete POS orders with payment (cashier)'),
  ('orders.cancel', 'orders', 'cancel', 'Cancel pending POS orders')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. GRANT ORDERS PERMISSIONS TO RELEVANT ROLES
-- =============================================================================
DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Super Administrator: gets ALL permissions (including new orders.*)
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Super Administrator' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog WHERE module = 'orders'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Super Administrator: orders permissions added';
  END IF;

  -- Administrator: gets ALL permissions
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Administrator' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog WHERE module = 'orders'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Administrator: orders permissions added';
  END IF;

  -- Manager: gets ALL orders permissions
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Manager' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog WHERE module = 'orders'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Manager: orders permissions added';
  END IF;

  -- Cashier: gets ALL orders permissions (orders.read, create, pay, cancel)
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Cashier' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog WHERE module = 'orders'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Cashier: orders permissions added';
  END IF;

  -- Accountant: gets ALL orders permissions (needed for payment collection)
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Accountant' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog WHERE module = 'orders'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Accountant: orders permissions added';
  END IF;

  -- Sales Representative: gets orders.read, orders.create, orders.pay
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Sales Representative' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key IN ('orders.read', 'orders.create', 'orders.pay')
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Sales Representative: orders permissions added';
  END IF;

  -- Auditor: gets orders.read only
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Auditor' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key = 'orders.read'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Auditor: orders.read added';
  END IF;

  -- Warehouse Clerk: gets orders.read only
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Warehouse Clerk' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key = 'orders.read'
    ON CONFLICT DO NOTHING;
    RAISE NOTICE 'Warehouse Clerk: orders.read added';
  END IF;
END $$;

COMMIT;

-- Verification
SELECT 'catalog' as check_type, count(*) as cnt FROM rbac_permissions_catalog WHERE module = 'orders'
UNION ALL
SELECT 'accountant_orders', count(*) FROM rbac_role_permissions rp
  JOIN rbac_roles r ON r.id = rp.role_id
  WHERE r.name = 'Accountant' AND rp.permission_key LIKE 'orders.%'
UNION ALL
SELECT 'accountant_total', count(*) FROM rbac_role_permissions rp
  JOIN rbac_roles r ON r.id = rp.role_id
  WHERE r.name = 'Accountant';
