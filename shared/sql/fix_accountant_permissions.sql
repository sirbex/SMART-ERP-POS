-- Fix Accountant role permissions: add POS, Sales, Orders, Expenses for payment workflows
-- Safe to run multiple times (INSERT ... ON CONFLICT DO NOTHING pattern)
-- Run on BOTH tenant databases: pos_system AND pos_tenant_henber_pharmacy

DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  -- Get the Accountant role ID
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Accountant' AND is_system_role = true;
  
  IF rid IS NULL THEN
    RAISE NOTICE 'Accountant role not found — skipping';
    RETURN;
  END IF;

  -- Delete existing permissions and re-insert the full set
  -- This ensures consistency regardless of what was manually added before
  DELETE FROM rbac_role_permissions WHERE role_id = rid;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  WHERE module IN ('accounting', 'banking', 'reports', 'expenses', 'orders')
     OR key IN (
       -- POS: process transactions & void
       'pos.read', 'pos.create', 'pos.void',
       -- Sales: full lifecycle for payment completion
       'sales.read', 'sales.create', 'sales.update', 'sales.void',
       'sales.refund', 'sales.approve', 'sales.export',
       -- Purchasing: read + create for invoice matching
       'purchasing.read', 'purchasing.create',
       -- Customers: read + create for customer payments
       'customers.read', 'customers.create', 'customers.export',
       -- Suppliers: read + create + update for supplier payments
       'suppliers.read', 'suppliers.create', 'suppliers.update',
       -- Inventory: read-only for stock reference
       'inventory.read',
       -- Settings & quotations: read-only
       'settings.read',
       'quotations.read'
     );

  RAISE NOTICE 'Accountant permissions updated: % permissions', (SELECT count(*) FROM rbac_role_permissions WHERE role_id = rid);
END $$;
