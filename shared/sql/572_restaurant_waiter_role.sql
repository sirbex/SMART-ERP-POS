-- 572: System Waiter role — restaurant FOH only (no kitchen / stations / recipes / pay).
-- Assign this role to floor staff so login lands on /restaurant and config nav stays hidden.

INSERT INTO rbac_roles (name, description, is_system_role, created_by, updated_by)
VALUES (
  'Waiter',
  'Restaurant floor service — open checks, KOT, and bill (no kitchen config or payment)',
  true,
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001'
)
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  is_system_role = true;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, p.key, '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
CROSS JOIN (VALUES
  ('restaurant.read'),
  ('restaurant.order'),
  ('customers.read'),
  ('customers.create')
) AS p(key)
WHERE r.name = 'Waiter'
  AND COALESCE(r.is_system_role, true) = true
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Waiters must never inherit kitchen/config/pay from prior mis-grants on this system role
DELETE FROM rbac_role_permissions rp
USING rbac_roles r
WHERE rp.role_id = r.id
  AND r.name = 'Waiter'
  AND COALESCE(r.is_system_role, true) = true
  AND rp.permission_key IN (
    'restaurant.kitchen',
    'restaurant.manage',
    'restaurant.pay'
  );
