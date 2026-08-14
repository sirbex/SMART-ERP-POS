-- =============================================================================
-- Migration 604: Enterprise HR payroll gaps
--   - Effective-dated salary / promotions (employee_salary_history)
--   - Leave types + approved leave → unpaid days reduce Process basic
--   - Period OT / bonus adjustments
--   - NSSF / PAYE statutory (Uganda defaults) + COA 2410/2420/6010
--   - Employee bank / NSSF / TIN for remittance / payslip
-- =============================================================================

-- 1) Statutory liability + employer NSSF expense accounts
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance",
  "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
SELECT gen_random_uuid(), '2410', 'NSSF Payable', 'LIABILITY', 'CREDIT',
       (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000' LIMIT 1),
       1, true, true, 0, NOW(), NOW(), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2410');

INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance",
  "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
SELECT gen_random_uuid(), '2420', 'PAYE Payable', 'LIABILITY', 'CREDIT',
       (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000' LIMIT 1),
       1, true, true, 0, NOW(), NOW(), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2420');

INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance",
  "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
SELECT gen_random_uuid(), '6010', 'Employer NSSF Expense', 'EXPENSE', 'DEBIT',
       (SELECT "Id" FROM accounts WHERE "AccountCode" = '6000' LIMIT 1),
       1, true, true, 0, NOW(), NOW(), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6010');

UPDATE accounts a
SET "ParentAccountId" = (
  SELECT p."Id" FROM accounts p
  WHERE p."AccountType" = 'LIABILITY' AND p."IsPostingAccount" = false
  ORDER BY p."AccountCode"
  LIMIT 1
)
WHERE a."AccountCode" IN ('2410', '2420') AND a."ParentAccountId" IS NULL;

UPDATE accounts a
SET "ParentAccountId" = (
  SELECT p."Id" FROM accounts p
  WHERE p."AccountType" = 'EXPENSE' AND p."IsPostingAccount" = false
  ORDER BY p."AccountCode"
  LIMIT 1
)
WHERE a."AccountCode" = '6010' AND a."ParentAccountId" IS NULL;

-- 2) Employee remittance + statutory fields
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'BankName'
  ) THEN
    ALTER TABLE employees ADD COLUMN "BankName" VARCHAR(120);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'BankAccountNumber'
  ) THEN
    ALTER TABLE employees ADD COLUMN "BankAccountNumber" VARCHAR(60);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'NssfNumber'
  ) THEN
    ALTER TABLE employees ADD COLUMN "NssfNumber" VARCHAR(40);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'TinNumber'
  ) THEN
    ALTER TABLE employees ADD COLUMN "TinNumber" VARCHAR(40);
  END IF;
END$$;

-- 3) Payroll entry enterprise columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'OvertimePay'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "OvertimePay" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'Bonus'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "Bonus" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'UnpaidLeaveDays'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "UnpaidLeaveDays" NUMERIC(8,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'LeaveDeduction'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "LeaveDeduction" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'NssfEmployee'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "NssfEmployee" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'Paye'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "Paye" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'NssfEmployer'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "NssfEmployer" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
END$$;

-- 4) Effective-dated salary / promotions
CREATE TABLE IF NOT EXISTS employee_salary_history (
  "Id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "EmployeeId"      UUID NOT NULL REFERENCES employees("Id") ON DELETE CASCADE,
  "EffectiveFrom"   DATE NOT NULL,
  "BasicSalary"     NUMERIC(15,2) NOT NULL CHECK ("BasicSalary" >= 0),
  "MonthlyAllowance" NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK ("MonthlyAllowance" >= 0),
  "PositionId"      UUID REFERENCES positions("Id"),
  "Reason"          VARCHAR(30) NOT NULL DEFAULT 'HIRE'
                      CHECK ("Reason" IN ('HIRE', 'PROMOTION', 'ADJUSTMENT', 'DEMOTION')),
  "Notes"           TEXT,
  "CreatedBy"       UUID,
  "CreatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_salary_history_emp_from
  ON employee_salary_history("EmployeeId", "EffectiveFrom");
CREATE INDEX IF NOT EXISTS idx_employee_salary_history_emp
  ON employee_salary_history("EmployeeId");

-- Seed history from current position + allowance (once)
INSERT INTO employee_salary_history (
  "EmployeeId", "EffectiveFrom", "BasicSalary", "MonthlyAllowance", "PositionId", "Reason", "Notes"
)
SELECT
  e."Id",
  COALESCE(e."HireDate", CURRENT_DATE),
  COALESCE(p."BaseSalary", 0),
  COALESCE(e."MonthlyAllowance", 0),
  e."PositionId",
  'HIRE',
  'Seeded from live position/allowance (migration 604)'
FROM employees e
LEFT JOIN positions p ON p."Id" = e."PositionId"
WHERE NOT EXISTS (
  SELECT 1 FROM employee_salary_history h WHERE h."EmployeeId" = e."Id"
);

-- 5) Leave
CREATE TABLE IF NOT EXISTS leave_types (
  "Id"        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Name"      VARCHAR(120) NOT NULL UNIQUE,
  "IsPaid"    BOOLEAN NOT NULL DEFAULT true,
  "IsActive"  BOOLEAN NOT NULL DEFAULT true,
  "CreatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO leave_types ("Name", "IsPaid")
SELECT v.name, v.paid
FROM (VALUES
  ('Annual Leave', true),
  ('Sick Leave', true),
  ('Unpaid Leave', false),
  ('Maternity Leave', true)
) AS v(name, paid)
WHERE NOT EXISTS (SELECT 1 FROM leave_types lt WHERE lt."Name" = v.name);

CREATE TABLE IF NOT EXISTS leave_requests (
  "Id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "EmployeeId"   UUID NOT NULL REFERENCES employees("Id"),
  "LeaveTypeId"  UUID NOT NULL REFERENCES leave_types("Id"),
  "StartDate"    DATE NOT NULL,
  "EndDate"      DATE NOT NULL,
  "Days"         NUMERIC(8,2) NOT NULL CHECK ("Days" > 0),
  "Status"       VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                   CHECK ("Status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  "Notes"        TEXT,
  "CreatedBy"    UUID,
  "ApprovedBy"   UUID,
  "CreatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "UpdatedAt"    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leave_requests_dates_ok CHECK ("EndDate" >= "StartDate")
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON leave_requests("EmployeeId");
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests("Status");
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests("StartDate", "EndDate");

-- 6) Period OT / bonus (before Process)
CREATE TABLE IF NOT EXISTS payroll_period_adjustments (
  "Id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "PayrollPeriodId"  UUID NOT NULL REFERENCES payroll_periods("Id") ON DELETE CASCADE,
  "EmployeeId"       UUID NOT NULL REFERENCES employees("Id"),
  "OvertimePay"      NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK ("OvertimePay" >= 0),
  "Bonus"            NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK ("Bonus" >= 0),
  "Notes"            TEXT,
  "CreatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "UpdatedAt"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_payroll_period_adj UNIQUE ("PayrollPeriodId", "EmployeeId")
);

CREATE INDEX IF NOT EXISTS idx_payroll_period_adj_period
  ON payroll_period_adjustments("PayrollPeriodId");

-- 7) Statutory settings (single-row tenant config)
CREATE TABLE IF NOT EXISTS hr_statutory_settings (
  "Id"                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "Enabled"                    BOOLEAN NOT NULL DEFAULT true,
  "NssfEmployeeRate"           NUMERIC(8,6) NOT NULL DEFAULT 0.05,
  "NssfEmployerRate"           NUMERIC(8,6) NOT NULL DEFAULT 0.10,
  "PayeEnabled"                BOOLEAN NOT NULL DEFAULT true,
  "PayeBandsJson"              JSONB NOT NULL DEFAULT '[
    {"from":0,"to":235000,"baseTax":0,"rate":0},
    {"from":235000,"to":335000,"baseTax":0,"rate":0.1},
    {"from":335000,"to":410000,"baseTax":10000,"rate":0.2},
    {"from":410000,"to":10000000,"baseTax":25000,"rate":0.3},
    {"from":10000000,"to":null,"baseTax":2870000,"rate":0.4}
  ]'::jsonb,
  "WorkingDaysPerMonth"        NUMERIC(8,2) NOT NULL DEFAULT 26,
  "NssfPayableAccount"         VARCHAR(20) NOT NULL DEFAULT '2410',
  "PayePayableAccount"         VARCHAR(20) NOT NULL DEFAULT '2420',
  "EmployerNssfExpenseAccount" VARCHAR(20) NOT NULL DEFAULT '6010',
  "UpdatedAt"                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO hr_statutory_settings ("Id")
SELECT gen_random_uuid()
WHERE NOT EXISTS (SELECT 1 FROM hr_statutory_settings LIMIT 1);

COMMENT ON TABLE employee_salary_history IS
  'Effective-dated basic + allowance. Process reads rate as-of period EndDate.';
COMMENT ON TABLE leave_requests IS
  'Approved unpaid leave overlapping a period reduces Process basic (prorata).';
COMMENT ON TABLE payroll_period_adjustments IS
  'OT/bonus entered before Process; included in gross.';
COMMENT ON TABLE hr_statutory_settings IS
  'NSSF/PAYE rates. Disable Enabled to keep legacy gross−advance=net math.';
