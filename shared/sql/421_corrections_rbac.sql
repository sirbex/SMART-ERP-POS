-- Migration: corrections.read / corrections.execute for enterprise correction APIs
-- Safe to run multiple times (idempotent via ON CONFLICT DO NOTHING)

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES
  ('corrections.read', 'corrections', 'read', 'View correction eligibility and previews'),
  (
    'corrections.execute',
    'corrections',
    'execute',
    'Execute correction wizards (wrong product, supplier reassignment)'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, p.key, '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
CROSS JOIN (
  VALUES ('corrections.read'), ('corrections.execute')
) AS p(key)
WHERE r.name IN ('Super Administrator', 'Manager')
ON CONFLICT (role_id, permission_key) DO NOTHING;
