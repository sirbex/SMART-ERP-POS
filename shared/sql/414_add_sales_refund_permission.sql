-- Migration: Add sales.refund permission to RBAC catalog and roles
-- Required for void/refund V2 feature
-- Safe to run multiple times (idempotent via ON CONFLICT DO NOTHING)

-- 1. Add to permissions catalog
INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES ('sales.refund', 'sales', 'refund', 'Refund completed sales')
ON CONFLICT (key) DO NOTHING;

-- 2. Grant to Super Administrator and Manager roles
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.refund', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Manager')
ON CONFLICT (role_id, permission_key) DO NOTHING;
