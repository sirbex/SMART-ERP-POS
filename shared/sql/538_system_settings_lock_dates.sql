-- Lock dates on system_settings (Odoo-style advisor + hard lock)
-- Used by GL reconciliation / posting date enforcement.

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS advisor_lock_date DATE,
  ADD COLUMN IF NOT EXISTS hard_lock_date DATE,
  ADD COLUMN IF NOT EXISTS lock_dates_updated_by UUID,
  ADD COLUMN IF NOT EXISTS lock_dates_updated_at TIMESTAMPTZ;

COMMENT ON COLUMN system_settings.advisor_lock_date IS
  'Advisor lock: posting before this date requires accounting.period_manage';
COMMENT ON COLUMN system_settings.hard_lock_date IS
  'Hard lock: no posting before this date (including admins)';
COMMENT ON COLUMN system_settings.lock_dates_updated_by IS
  'User who last changed lock dates';
COMMENT ON COLUMN system_settings.lock_dates_updated_at IS
  'When lock dates were last changed';
