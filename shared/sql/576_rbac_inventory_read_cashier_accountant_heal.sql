-- 576: Re-assert inventory.read for Cashier + Accountant (heal products/batches 403).
-- Broader than 575: matches role name case-insensitively, system or custom copies.
-- Waiter intentionally does NOT get inventory.read (FOH uses /inventory/pos/catalog).

DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000001';
  added INT := 0;
BEGIN
  -- Ensure catalog key exists
  INSERT INTO rbac_permissions_catalog (key, module, action, description)
  VALUES ('inventory.read', 'inventory', 'read', 'View inventory and product catalog')
  ON CONFLICT (key) DO NOTHING;

  FOR rid IN
    SELECT id FROM rbac_roles
    WHERE lower(name) IN ('cashier', 'accountant')
  LOOP
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    VALUES (rid, 'inventory.read', sys)
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '576 inventory.read grant for role % (new=%)', rid, added;
  END LOOP;

  -- Cashier FOH keys that may still be missing on custom role copies
  FOR rid IN
    SELECT id FROM rbac_roles WHERE lower(name) = 'cashier'
  LOOP
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key IN (
      'restaurant.read', 'restaurant.order', 'restaurant.kitchen', 'restaurant.pay',
      'customers.read', 'customers.create',
      'pos.read', 'pos.create',
      'sales.read', 'sales.create'
    )
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END LOOP;

  -- Accountant restaurant + inventory browse
  FOR rid IN
    SELECT id FROM rbac_roles WHERE lower(name) = 'accountant'
  LOOP
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key IN (
      'inventory.read',
      'restaurant.read', 'restaurant.order', 'restaurant.kitchen', 'restaurant.pay',
      'customers.read', 'customers.create', 'customers.update'
    )
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END LOOP;
END $$;
