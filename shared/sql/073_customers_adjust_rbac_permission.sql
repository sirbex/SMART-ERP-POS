-- =====================================================
-- Migration: 073_customers_adjust_rbac_permission.sql
-- Purpose: Register customers.adjust in rbac_permissions_catalog and
--          grant to roles that can correct customer invoices (credit notes).
--
-- Root cause: Permission added in permissions.ts + UI in commit 43811fd but
-- deploy-update.sh does NOT run rbac seed. Production henber: Adjust button
-- hidden because useHasAnyPermission(['customers.adjust']) is false even
-- for unpaid invoices (INV-2026-0005). Local dev often has seed run → button visible.
-- Same class of bug as 20260506_add_sales_reprint_rbac_permission.sql.
-- =====================================================

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES ('customers.adjust', 'customers', 'adjust', 'Adjust customer invoices (credit notes)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'customers.adjust', COALESCE((SELECT id FROM users LIMIT 1), '00000000-0000-0000-0000-000000000001'::uuid)
FROM rbac_roles r
WHERE r.name = 'Super Administrator' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'customers.adjust', COALESCE((SELECT id FROM users LIMIT 1), '00000000-0000-0000-0000-000000000001'::uuid)
FROM rbac_roles r
WHERE r.name = 'Administrator' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'customers.adjust', COALESCE((SELECT id FROM users LIMIT 1), '00000000-0000-0000-0000-000000000001'::uuid)
FROM rbac_roles r
WHERE r.name = 'Manager' AND r.is_system_role = true
ON CONFLICT DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'customers.adjust', COALESCE((SELECT id FROM users LIMIT 1), '00000000-0000-0000-0000-000000000001'::uuid)
FROM rbac_roles r
WHERE r.name = 'Accountant' AND r.is_system_role = true
ON CONFLICT DO NOTHING;
