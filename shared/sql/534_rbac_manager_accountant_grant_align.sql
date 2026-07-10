-- 534: Align Manager + Accountant system role grants with shared/authorization/systemRoleGrants.ts
-- Additive only (ON CONFLICT DO NOTHING) — does not wipe custom grants.
-- Fixes post-auth-refactor denials:
--   Manager missing accounting / quotations / distribution / hr
--   Accountant missing customers.update (AR payments) and distribution.read

DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000001';
  added INT := 0;
BEGIN
  -- Ensure catalog keys exist (safe if already present)
  INSERT INTO rbac_permissions_catalog (key, module, action, description)
  VALUES
    ('customers.update', 'customers', 'update', 'Update customer records and post customer payments'),
    ('distribution.read', 'distribution', 'read', 'View distribution sales orders and invoices'),
    ('accounting.read', 'accounting', 'read', 'View accounting modules'),
    ('quotations.read', 'quotations', 'read', 'View quotations')
  ON CONFLICT (key) DO NOTHING;

  -- -------------------------------------------------------
  -- Manager: grant full modules matching SYSTEM_MANAGER_MODULES / LEGACY_MANAGER_MODULES
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Manager' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE module IN (
      'sales', 'inventory', 'purchasing', 'customers', 'suppliers',
      'reports', 'pos', 'accounting', 'banking', 'delivery', 'settings',
      'hr', 'expenses', 'quotations', 'crm', 'orders', 'distribution'
    )
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '534 Manager grants applied (new rows this run ≈ %)', added;
  ELSE
    RAISE NOTICE '534 Manager role not found — skipped';
  END IF;

  -- -------------------------------------------------------
  -- Accountant: modules + extra keys including customers.update
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Accountant' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE module IN ('accounting', 'banking', 'reports', 'expenses', 'orders')
       OR key IN (
         'pos.read', 'pos.create', 'pos.void',
         'sales.read', 'sales.create', 'sales.update', 'sales.void',
         'sales.refund', 'sales.approve', 'sales.export',
         'purchasing.read', 'purchasing.create',
         'customers.read', 'customers.create', 'customers.export',
         'customers.update', 'customers.adjust',
         'suppliers.read', 'suppliers.create', 'suppliers.update',
         'corrections.read', 'corrections.execute',
         'inventory.read',
         'settings.read',
         'quotations.read',
         'distribution.read'
       )
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '534 Accountant grants applied (new rows this run ≈ %)', added;
  ELSE
    RAISE NOTICE '534 Accountant role not found — skipped';
  END IF;
END $$;
