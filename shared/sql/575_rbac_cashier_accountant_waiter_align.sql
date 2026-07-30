-- 575: Align Cashier / Accountant / Waiter grants with shared/authorization/systemRoleGrants.ts
-- Additive for Cashier + Accountant; strips restaurant.pay/kitchen/manage from Waiter.
-- Fixes: cashiers missing inventory.read (batches-all / stock levels 403);
--        accountants missing restaurant.order (FOH floor access).

DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000001';
  added INT := 0;
BEGIN
  -- -------------------------------------------------------
  -- Cashier: inventory browse + FOH settle + customers (SSOT)
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Cashier' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key IN (
      'pos.read', 'pos.create',
      'sales.read', 'sales.create',
      'customers.read', 'customers.create',
      'inventory.read',
      'delivery.read',
      'settings.read',
      'quotations.read', 'quotations.create',
      'orders.read', 'orders.pay', 'orders.cancel',
      'restaurant.read', 'restaurant.order', 'restaurant.kitchen', 'restaurant.pay',
      'reports.sales_view',
      'expenses.read', 'expenses.create'
    )
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '575 Cashier grants applied (new rows this run ≈ %)', added;
  ELSE
    RAISE NOTICE '575 Cashier role not found — skipped';
  END IF;

  -- -------------------------------------------------------
  -- Accountant: full accounting modules + restaurant FOH operate/pay
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
         'distribution.read',
         'restaurant.read', 'restaurant.order', 'restaurant.kitchen', 'restaurant.pay'
       )
    ON CONFLICT (role_id, permission_key) DO NOTHING;
    GET DIAGNOSTICS added = ROW_COUNT;
    RAISE NOTICE '575 Accountant grants applied (new rows this run ≈ %)', added;
  ELSE
    RAISE NOTICE '575 Accountant role not found — skipped';
  END IF;

  -- -------------------------------------------------------
  -- Waiter: never pay / kitchen / manage
  -- -------------------------------------------------------
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Waiter' AND is_system_role = true;
  IF rid IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys FROM rbac_permissions_catalog
    WHERE key IN (
      'restaurant.read', 'restaurant.order',
      'customers.read', 'customers.create'
    )
    ON CONFLICT (role_id, permission_key) DO NOTHING;

    DELETE FROM rbac_role_permissions rp
    WHERE rp.role_id = rid
      AND rp.permission_key IN (
        'restaurant.kitchen',
        'restaurant.manage',
        'restaurant.pay'
      );
    RAISE NOTICE '575 Waiter grants aligned (pay/kitchen/manage stripped)';
  ELSE
    RAISE NOTICE '575 Waiter role not found — skipped';
  END IF;
END $$;
