-- 535: Expand system Administrator role to full catalog (match Super Administrator).
-- Users with users.role=ADMIN often also have RBAC "Administrator" (partial grants).
-- After permission-first auth, partial grants caused widespread 403s.
-- Additive only.

DO $$
DECLARE
  rid UUID;
  sys UUID := '00000000-0000-0000-0000-000000000001';
  added INT := 0;
BEGIN
  SELECT id INTO rid FROM rbac_roles WHERE name = 'Administrator' AND is_system_role = true;
  IF rid IS NULL THEN
    RAISE NOTICE '535 Administrator role not found — skipped';
    RETURN;
  END IF;

  INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
  SELECT rid, key, sys FROM rbac_permissions_catalog
  ON CONFLICT (role_id, permission_key) DO NOTHING;

  GET DIAGNOSTICS added = ROW_COUNT;
  RAISE NOTICE '535 Administrator full-catalog grants applied (new rows ≈ %)', added;

  UPDATE rbac_roles
  SET description = 'Administrative access — full permissions (aligned with legacy ADMIN)',
      updated_at = NOW(),
      updated_by = sys
  WHERE id = rid;
END $$;
