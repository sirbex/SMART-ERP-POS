-- Migration 510: Grant expense permissions to Manager role
DO $$
DECLARE
  v_manager_role_id UUID;
  v_system_user_id UUID;
BEGIN
  SELECT id INTO v_system_user_id
  FROM users
  WHERE role = 'ADMIN'
  ORDER BY created_at ASC
  LIMIT 1;

  SELECT id INTO v_manager_role_id
  FROM rbac_roles
  WHERE name = 'Manager'
  LIMIT 1;

  IF v_manager_role_id IS NULL THEN
    RAISE NOTICE 'Manager role not found — skipping';
    RETURN;
  END IF;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  VALUES (v_manager_role_id, 'expenses.read', v_system_user_id)
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  VALUES (v_manager_role_id, 'expenses.create', v_system_user_id)
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  VALUES (v_manager_role_id, 'expenses.approve', v_system_user_id)
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  RAISE NOTICE 'Manager expense permissions granted successfully';
END $$;
