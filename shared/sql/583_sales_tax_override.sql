-- Migration 583: DocumentTax Phase 5 — VAT/tax override (RBAC + audit columns)

-- 1. Permission catalog
INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES (
  'sales.tax_override',
  'sales',
  'tax_override',
  'Override VAT/tax determination on sales (requires reason + audit)'
)
ON CONFLICT (key) DO UPDATE SET
  module = EXCLUDED.module,
  action = EXCLUDED.action,
  description = EXCLUDED.description;

-- 2. Grant to Super Administrator, Administrator, Manager (not Cashier by default)
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'sales.tax_override', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Administrator', 'Manager')
  AND r.is_system_role = true
ON CONFLICT DO NOTHING;

-- 3. Persist override on sales header for audit / reporting
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS tax_override_mode VARCHAR(30),
  ADD COLUMN IF NOT EXISTS tax_override_rate NUMERIC(10, 4),
  ADD COLUMN IF NOT EXISTS tax_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS tax_override_by UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sales_tax_override_mode'
  ) THEN
    ALTER TABLE sales
      ADD CONSTRAINT chk_sales_tax_override_mode
      CHECK (
        tax_override_mode IS NULL
        OR tax_override_mode IN ('FORCE_EXEMPT', 'FORCE_RATE')
      );
  END IF;
END $$;

COMMENT ON COLUMN sales.tax_override_mode IS
  'DocumentTax override: FORCE_EXEMPT | FORCE_RATE (null = normal determination).';
COMMENT ON COLUMN sales.tax_override_reason IS
  'Required reason when tax_override_mode is set.';

-- 4. Allow TAX_OVERRIDE on audit_log action check
ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
    'CREATE', 'UPDATE', 'DELETE', 'VOID', 'CANCEL', 'REFUND', 'EXCHANGE',
    'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'PERMISSION_CHANGE',
    'APPROVE', 'REJECT', 'RESTORE', 'ARCHIVE', 'EXPORT', 'IMPORT',
    'OPEN_DRAWER', 'CLOSE_SHIFT', 'ADJUST_INVENTORY', 'PRICE_CHANGE',
    'PRICE_OVERRIDE', 'TAX_OVERRIDE', 'STATUS_CHANGE', 'FINALIZE', 'REMOVE', 'REPRINT'
));

INSERT INTO schema_version (version) VALUES (583) ON CONFLICT DO NOTHING;
