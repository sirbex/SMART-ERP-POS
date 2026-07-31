-- 578: Permissions SSOT heals
-- 1) Catalog key inventory.adjust (Role UI / Adjustments page) — was missing from early SQL seed
-- 2) Seed Takeaway/Delivery/Quick service lanes so waiters can take orders without restaurant.manage
-- 3) Re-assert Waiter floor grants (restaurant.order + customers)

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'inventory.adjust',
  'inventory',
  'adjust',
  'Perform stock adjustments (add, remove, transfer)'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'inventory.approve',
  'inventory',
  'approve',
  'Approve stock adjustments'
)
ON CONFLICT (key) DO NOTHING;

-- Service lanes (idempotent)
INSERT INTO restaurant_tables (code, name, zone, seats, sort_order, is_active, status)
SELECT v.code, v.name, 'SERVICE', 0, v.sort_order, TRUE, 'FREE'
FROM (VALUES
  ('TA', 'Takeaway', 9001),
  ('DL', 'Delivery', 9002),
  ('QK', 'Quick order', 9003)
) AS v(code, name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM restaurant_tables t WHERE UPPER(t.code) = v.code
);

UPDATE restaurant_tables
SET is_active = TRUE,
    zone = 'SERVICE',
    name = CASE UPPER(code)
      WHEN 'TA' THEN 'Takeaway'
      WHEN 'DL' THEN 'Delivery'
      WHEN 'QK' THEN 'Quick order'
      ELSE name
    END,
    updated_at = NOW()
WHERE UPPER(code) IN ('TA', 'DL', 'QK')
  AND (is_active IS DISTINCT FROM TRUE OR UPPER(COALESCE(zone, '')) IS DISTINCT FROM 'SERVICE');

-- Waiter floor grants (takeaway needs restaurant.order + customers)
DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  FOR rid IN
    SELECT id FROM rbac_roles WHERE lower(name) = 'waiter'
  LOOP
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    SELECT rid, key, sys
    FROM (VALUES
      ('restaurant.read'),
      ('restaurant.order'),
      ('customers.read'),
      ('customers.create')
    ) AS p(key)
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END LOOP;
END $$;

INSERT INTO schema_version (version) VALUES (578) ON CONFLICT DO NOTHING;
