-- =====================================================
-- Migration: 20260506_add_sales_reprint_rbac_permission.sql
-- Purpose: Register sales.reprint in rbac_permissions_catalog and
--          assign it to all roles that should be able to reprint receipts.
--
-- Root cause: The permission was defined in TypeScript (permissions.ts)
-- and in the legacy role mapping but was never inserted into the DB.
-- When RBAC is active (permissions.size > 0), the frontend checks the DB
-- exclusively — the legacy fallback never fires — so the button was hidden
-- for ALL users including admins.
-- =====================================================

-- 1. Insert the permission into the catalog (idempotent)
INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES ('sales.reprint', 'sales', 'reprint', 'Reprint sale receipts')
ON CONFLICT (key) DO NOTHING;

-- 2. Grant to Super Administrator (gets all catalog permissions)
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.reprint', (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
FROM rbac_roles r
WHERE r.name = 'Super Administrator' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

-- 3. Grant to Administrator
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.reprint', (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
FROM rbac_roles r
WHERE r.name = 'Administrator' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

-- 4. Grant to Manager (already gets full 'sales' module — but add explicitly for safety)
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.reprint', (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
FROM rbac_roles r
WHERE r.name = 'Manager' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

-- 5. Grant to Cashier (cashier can reprint the receipt they just issued)
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.reprint', (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
FROM rbac_roles r
WHERE r.name = 'Cashier' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

-- 6. Grant to Accountant (needs receipt access for reconciliation)
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.reprint', (SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1)
FROM rbac_roles r
WHERE r.name = 'Accountant' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

-- Verify
SELECT r.name, rp.permission_key
FROM rbac_role_permissions rp
JOIN rbac_roles r ON r.id = rp.role_id
WHERE rp.permission_key = 'sales.reprint'
ORDER BY r.name;
