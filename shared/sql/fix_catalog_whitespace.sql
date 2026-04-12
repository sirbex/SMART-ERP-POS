-- Fix whitespace-corrupted rbac_permissions_catalog entries
-- Both key and module columns have leading/trailing spaces on some rows
-- This cleans them up and then re-applies Accountant permissions
-- Safe to run multiple times
-- Run on BOTH databases: pos_system AND pos_tenant_henber_pharmacy

BEGIN;

-- Step 1: Fix whitespace in key column
UPDATE rbac_permissions_catalog
SET key = TRIM(key)
WHERE key != TRIM(key);

-- Step 2: Fix whitespace in module column
UPDATE rbac_permissions_catalog
SET module = TRIM(module)
WHERE module != TRIM(module);

-- Step 3: Remove any exact duplicates that may result from trimming
-- (e.g., ' accounting ' and 'accounting' becoming the same)
DELETE FROM rbac_permissions_catalog a
USING rbac_permissions_catalog b
WHERE a.ctid > b.ctid
  AND a.key = b.key;

-- Step 4: Also clean up role_permissions that reference padded keys
UPDATE rbac_role_permissions
SET permission_key = TRIM(permission_key)
WHERE permission_key != TRIM(permission_key);

-- Remove duplicate role_permissions after trimming
DELETE FROM rbac_role_permissions a
USING rbac_role_permissions b
WHERE a.ctid > b.ctid
  AND a.role_id = b.role_id
  AND a.permission_key = b.permission_key;

COMMIT;

-- Step 5: Re-apply Accountant permissions with clean data
DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Accountant' AND is_system_role = true;
  
  IF rid IS NULL THEN
    RAISE NOTICE 'Accountant role not found — skipping';
    RETURN;
  END IF;

  DELETE FROM rbac_role_permissions WHERE role_id = rid;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  WHERE module IN ('accounting', 'banking', 'reports', 'expenses', 'orders')
     OR key IN (
       'pos.read', 'pos.create', 'pos.void',
       'sales.read', 'sales.create', 'sales.update', 'sales.void',
       'sales.refund', 'sales.approve', 'sales.export',
       'purchasing.read', 'purchasing.create',
       'customers.read', 'customers.create', 'customers.export',
       'suppliers.read', 'suppliers.create', 'suppliers.update',
       'inventory.read',
       'settings.read',
       'quotations.read', 'quotations.create', 'quotations.update'
     );

  RAISE NOTICE 'Accountant permissions updated: % permissions', (SELECT count(*) FROM rbac_role_permissions WHERE role_id = rid);
END $$;

-- Verification
SELECT count(*) as catalog_entries FROM rbac_permissions_catalog;
SELECT count(*) as accountant_perms FROM rbac_role_permissions rp JOIN rbac_roles r ON r.id = rp.role_id WHERE r.name = 'Accountant';
SELECT count(*) as padded_keys FROM rbac_permissions_catalog WHERE key != TRIM(key);
SELECT count(*) as padded_modules FROM rbac_permissions_catalog WHERE module != TRIM(module);
