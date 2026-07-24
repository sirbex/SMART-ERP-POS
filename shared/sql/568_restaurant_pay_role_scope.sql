-- 568: Restaurant Pay — Cashier, Accountant, Admin only (not Manager / waiter).
-- Waiters keep restaurant.order for floor service; payment uses restaurant.pay.

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES
  ('restaurant.pay', 'restaurant', 'pay', 'Print bill and complete restaurant payment')
ON CONFLICT (key) DO NOTHING;

-- Ensure payers
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'restaurant.pay', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Administrator', 'Cashier', 'Accountant')
  AND COALESCE(r.is_system_role, true) = true
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Floor managers / waiters must not take payment from Restaurant POS
DELETE FROM rbac_role_permissions rp
USING rbac_roles r
WHERE rp.role_id = r.id
  AND rp.permission_key = 'restaurant.pay'
  AND r.name = 'Manager'
  AND COALESCE(r.is_system_role, true) = true;
