DO $$
DECLARE
  admin_id UUID;
  manager_id UUID;
  super_admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM rbac_roles WHERE name = 'Administrator';
  SELECT id INTO manager_id FROM rbac_roles WHERE name = 'Manager';
  SELECT id INTO super_admin_id FROM rbac_roles WHERE name = 'Super Administrator';

  IF admin_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    VALUES (admin_id, 'inventory.batch_expiry_edit', admin_id)
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;

  IF manager_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    VALUES (manager_id, 'inventory.batch_expiry_edit', manager_id)
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;

  IF super_admin_id IS NOT NULL THEN
    INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
    VALUES (super_admin_id, 'inventory.batch_expiry_edit', super_admin_id)
    ON CONFLICT (role_id, permission_key) DO NOTHING;
  END IF;
END $$;
