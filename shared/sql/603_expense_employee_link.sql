-- Migration 603: Link expenses to HR employees for audit (Odoo/SAP-style)
-- Daily staff transport / allowances paid via Accounts stay off payroll;
-- employee_id is for who received / claimed the payout only.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'expenses'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'employees'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'employee_id'
  ) THEN
    ALTER TABLE expenses
      ADD COLUMN employee_id UUID NULL
      REFERENCES employees("Id") ON DELETE SET NULL;

    COMMENT ON COLUMN expenses.employee_id IS
      'Optional HR employee for audit (who received/claimed). Not payroll gross; not NSSF/PAYE; not advance recovery.';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_employee_id ON expenses(employee_id)
  WHERE employee_id IS NOT NULL;
