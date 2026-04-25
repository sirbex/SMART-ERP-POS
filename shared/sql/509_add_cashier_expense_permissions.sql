-- Migration 509: Add expense permissions to Cashier role
-- Allows cashiers to view and create expense claims (e.g., fuel, allowances)

DO $$
DECLARE
  v_cashier_role_id UUID;
  v_system_user_id UUID;
BEGIN
  -- Get the system user ID (first admin user)
  SELECT id INTO v_system_user_id
  FROM users
  WHERE role = 'ADMIN'
  ORDER BY created_at ASC
  LIMIT 1;

  -- Get the Cashier role ID
  SELECT id INTO v_cashier_role_id
  FROM rbac_roles
  WHERE name = 'Cashier'
  LIMIT 1;

  IF v_cashier_role_id IS NULL THEN
    RAISE NOTICE 'Cashier role not found — skipping expense permission grant';
    RETURN;
  END IF;

  -- Grant expenses.read
  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  VALUES (v_cashier_role_id, 'expenses.read', v_system_user_id)
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  -- Grant expenses.create
  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  VALUES (v_cashier_role_id, 'expenses.create', v_system_user_id)
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  RAISE NOTICE 'Cashier expense permissions granted successfully';
END $$;
