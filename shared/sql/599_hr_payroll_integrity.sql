-- =============================================================================
-- Migration 599: HR payroll integrity constraints (no duplicate / mismatch)
-- =============================================================================

-- One payroll entry per employee per period (prevents double accrual)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payroll_entries_period_employee_uq'
  ) THEN
    ALTER TABLE payroll_entries
      ADD CONSTRAINT payroll_entries_period_employee_uq
      UNIQUE ("PayrollPeriodId", "EmployeeId");
  END IF;
END$$;

-- One recovery link per advance × payroll entry (no duplicate recoveries)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_advance_recoveries_uq'
  ) THEN
    ALTER TABLE employee_advance_recoveries
      ADD CONSTRAINT employee_advance_recoveries_uq
      UNIQUE ("AdvanceId", "PayrollEntryId");
  END IF;
END$$;

-- Remaining must never go negative (defense in depth)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'employee_advances_remaining_nonneg'
  ) THEN
    ALTER TABLE employee_advances
      ADD CONSTRAINT employee_advances_remaining_nonneg
      CHECK ("RemainingAmount" >= 0);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

INSERT INTO schema_version (version) VALUES (599) ON CONFLICT DO NOTHING;
