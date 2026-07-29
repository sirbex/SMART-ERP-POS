-- 573: Multi-waiter check ownership + per-line attribution (Toast/Aloha pattern)
--
-- 1) pos_order_items.added_by — who rang each line (owner may differ after handoff)
-- 2) restaurant.edit_others — open/edit checks owned by another waiter
--    Managers get it via restaurant.manage; Cashiers via restaurant.pay (settlement floor).
--    Explicit grant for custom roles that need floor override without pay/manage.

ALTER TABLE pos_order_items
  ADD COLUMN IF NOT EXISTS added_by UUID NULL REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_pos_order_items_added_by
  ON pos_order_items (added_by)
  WHERE added_by IS NOT NULL;

-- Backfill: attribute historical lines to the check opener / check waiter when known
-- (waiter_id exists after 560; COALESCE is safe if null)
UPDATE pos_order_items oi
SET added_by = COALESCE(o.waiter_id, o.created_by)
FROM pos_orders o
WHERE oi.order_id = o.id
  AND oi.added_by IS NULL
  AND (o.waiter_id IS NOT NULL OR o.created_by IS NOT NULL);

INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'restaurant.edit_others',
  'restaurant',
  'update',
  'Open and edit restaurant checks owned by another waiter'
)
ON CONFLICT (key) DO NOTHING;

-- Managers / cashiers / admins may open peer checks; Waiter must not.
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'restaurant.edit_others', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Administrator', 'Manager', 'Cashier')
  AND COALESCE(r.is_system_role, true) = true
ON CONFLICT (role_id, permission_key) DO NOTHING;

DELETE FROM rbac_role_permissions rp
USING rbac_roles r
WHERE rp.role_id = r.id
  AND r.name = 'Waiter'
  AND COALESCE(r.is_system_role, true) = true
  AND rp.permission_key = 'restaurant.edit_others';

INSERT INTO schema_version (version) VALUES (573) ON CONFLICT DO NOTHING;
