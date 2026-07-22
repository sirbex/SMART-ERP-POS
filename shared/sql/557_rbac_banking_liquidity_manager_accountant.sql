-- 557: Ensure Manager + Accountant can use Banking & Liquidity
-- Re-grants banking.* and accounting.read/manage needed for treasury tabs
-- (undeposited receipts, move money, petty cash, documents).
-- Additive only (ON CONFLICT DO NOTHING).

DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000001';
  added INT := 0;
BEGIN
  INSERT INTO rbac_permissions_catalog (key, module, action, description)
  VALUES
    ('banking.read', 'banking', 'read', 'View bank accounts and transactions'),
    ('banking.create', 'banking', 'create', 'Create bank accounts and transactions'),
    ('banking.update', 'banking', 'update', 'Update bank accounts and transaction details'),
    ('banking.delete', 'banking', 'delete', 'Delete or reverse bank transactions'),
    ('banking.reconcile', 'banking', 'reconcile', 'Reconcile bank transactions'),
    ('banking.import', 'banking', 'import', 'Import bank statements'),
    ('banking.export', 'banking', 'export', 'Export banking data'),
    ('accounting.read', 'accounting', 'read', 'View accounting modules'),
    ('accounting.manage', 'accounting', 'manage', 'Manage accounting configuration and post liquidity documents')
  ON CONFLICT (key) DO NOTHING;

  -- Manager
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Manager' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE module = 'banking'
       OR key IN ('accounting.read', 'accounting.manage')
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '557 Manager banking/liquidity grants (new rows ≈ %)', added;
  ELSE
    RAISE NOTICE '557 Manager role not found — skipped';
  END IF;

  -- Accountant
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Accountant' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE module = 'banking'
       OR key IN ('accounting.read', 'accounting.manage')
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '557 Accountant banking/liquidity grants (new rows ≈ %)', added;
  ELSE
    RAISE NOTICE '557 Accountant role not found — skipped';
  END IF;
END $$;

INSERT INTO schema_version (version) VALUES (557) ON CONFLICT DO NOTHING;
