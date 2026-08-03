-- Migration 586: sales.print_count for receipt reprint audit
-- Production drift: old 028 migration lived under shared/sql/migrations/ and never ran
-- through the numbered runner used by deploy. Reprint endpoint needs this column.

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS print_count INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN sales.print_count IS
  'Number of times the receipt has been printed / audited (0 = never).';

-- Allow REPRINT on audit_log when check constraint still lists action enums
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_log_action_check'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_action_check;
    ALTER TABLE audit_log ADD CONSTRAINT audit_log_action_check CHECK (action IN (
      'CREATE', 'UPDATE', 'DELETE', 'VOID', 'CANCEL', 'REFUND', 'EXCHANGE',
      'LOGIN', 'LOGOUT', 'LOGIN_FAILED', 'PASSWORD_CHANGE', 'PERMISSION_CHANGE',
      'APPROVE', 'REJECT', 'RESTORE', 'ARCHIVE', 'EXPORT', 'IMPORT',
      'OPEN_DRAWER', 'CLOSE_SHIFT', 'ADJUST_INVENTORY', 'PRICE_CHANGE',
      'PRICE_OVERRIDE', 'STATUS_CHANGE', 'FINALIZE', 'REMOVE', 'REPRINT'
    ));
  END IF;
EXCEPTION
  WHEN others THEN
    -- Non-fatal: some tenants use unconstrained action text.
    RAISE NOTICE '586 audit_log_action_check refresh skipped: %', SQLERRM;
END $$;

INSERT INTO schema_version (version) VALUES (586) ON CONFLICT DO NOTHING;
