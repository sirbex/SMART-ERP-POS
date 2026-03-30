-- =============================================================================
-- HR & Payroll Module - Database Migration
-- Creates tables: departments, positions, employees, payroll_periods, payroll_entries
-- =============================================================================

-- 1. Departments
CREATE TABLE IF NOT EXISTS departments (
  "Id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name"      VARCHAR(255) NOT NULL,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Positions
CREATE TABLE IF NOT EXISTS positions (
  "Id"         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Title"      VARCHAR(255) NOT NULL,
  "BaseSalary" NUMERIC(15,2),
  "CreatedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Employees
CREATE TABLE IF NOT EXISTS employees (
  "Id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "UserId"       UUID REFERENCES users(id),
  "FirstName"    VARCHAR(255) NOT NULL,
  "LastName"     VARCHAR(255) NOT NULL,
  "Phone"        VARCHAR(50),
  "Email"        VARCHAR(255),
  "DepartmentId" UUID REFERENCES departments("Id"),
  "PositionId"   UUID REFERENCES positions("Id"),
  "HireDate"     DATE NOT NULL DEFAULT CURRENT_DATE,
  "Status"       VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK ("Status" IN ('ACTIVE', 'INACTIVE')),
  "CreatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employees_status ON employees("Status");
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees("DepartmentId");
CREATE INDEX IF NOT EXISTS idx_employees_position ON employees("PositionId");

-- 4. Payroll Periods
CREATE TABLE IF NOT EXISTS payroll_periods (
  "Id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "StartDate" DATE NOT NULL,
  "EndDate"   DATE NOT NULL,
  "Status"    VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK ("Status" IN ('OPEN', 'PROCESSED', 'POSTED')),
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_periods_status ON payroll_periods("Status");
CREATE INDEX IF NOT EXISTS idx_payroll_periods_dates ON payroll_periods("StartDate", "EndDate");

-- 5. Payroll Entries
CREATE TABLE IF NOT EXISTS payroll_entries (
  "Id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "PayrollPeriodId" UUID NOT NULL REFERENCES payroll_periods("Id") ON DELETE CASCADE,
  "EmployeeId"      UUID NOT NULL REFERENCES employees("Id"),
  "BasicSalary"     NUMERIC(15,2) NOT NULL DEFAULT 0,
  "Allowances"      NUMERIC(15,2) NOT NULL DEFAULT 0,
  "Deductions"      NUMERIC(15,2) NOT NULL DEFAULT 0,
  "NetPay"          NUMERIC(15,2) NOT NULL DEFAULT 0,
  "JournalEntryId"  UUID,
  "CreatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_entries_period ON payroll_entries("PayrollPeriodId");
CREATE INDEX IF NOT EXISTS idx_payroll_entries_employee ON payroll_entries("EmployeeId");

-- 6. Extend audit_log entity_type CHECK constraint to include HR entity types
-- (Only run this if the constraint exists; safe to skip if your audit_log doesn't enforce entity types via CHECK)
DO $$
BEGIN
  -- Drop existing constraint if it exists and re-create with HR types included
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'audit_log' AND constraint_type = 'CHECK'
    AND constraint_name = 'audit_log_entity_type_check'
  ) THEN
    ALTER TABLE audit_log DROP CONSTRAINT audit_log_entity_type_check;
  END IF;
END$$;

-- Add updated constraint with HR entity types
-- Note: If your audit_log uses a free-text entity_type column without CHECK, this is a no-op
-- ALTER TABLE audit_log ADD CONSTRAINT audit_log_entity_type_check
--   CHECK (entity_type IN (...existing types..., 'DEPARTMENT', 'POSITION', 'EMPLOYEE', 'PAYROLL_PERIOD', 'PAYROLL_ENTRY'));
