-- Migration 608: Quarantine auto-dispose after aging (soft quarantine P4)
-- Separate from expiry_automation_enabled. Default OFF — posts P&L when run.

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS quarantine_auto_dispose_enabled BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS quarantine_auto_dispose_min_age_days INTEGER NOT NULL DEFAULT 30;

COMMENT ON COLUMN system_settings.quarantine_auto_dispose_enabled IS
    'When true, nightly job disposes EXPIRED quarantine lines older than min age days (P&L). Default off.';

COMMENT ON COLUMN system_settings.quarantine_auto_dispose_min_age_days IS
    'Minimum days in quarantine before auto-dispose is eligible. Default 30. Only EXPIRED bucket.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_quarantine_auto_dispose_min_age_days'
  ) THEN
    ALTER TABLE system_settings
      ADD CONSTRAINT chk_quarantine_auto_dispose_min_age_days
      CHECK (quarantine_auto_dispose_min_age_days >= 0 AND quarantine_auto_dispose_min_age_days <= 3650);
  END IF;
END $$;

INSERT INTO schema_version (version) VALUES (608) ON CONFLICT DO NOTHING;
