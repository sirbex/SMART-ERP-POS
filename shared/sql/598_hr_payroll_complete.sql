-- =============================================================================
-- Migration 598: Complete HR payroll loop (enterprise BS-safe)
-- SAP/Tally/QB pattern, simplified:
--   Accrue  → DR 6000 / CR 1410 (advance recovery) / CR 2400 (net payable)
--   Pay     → DR 2400 / CR Cash|Bank
--   Advance → DR 1410 / CR Cash|Bank  (incl. cash-shortage charge to employee)
-- =============================================================================

-- 1) Employee Advances header (asset receivable — Tally "Loans & Advances", Odoo 141)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance",
  "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
SELECT gen_random_uuid(), '1410', 'Employee Advances', 'ASSET', 'DEBIT',
       (SELECT "Id" FROM accounts WHERE "AccountCode" = '1000' LIMIT 1),
       1, false, true, 0, NOW(), NOW(), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1410');

-- Fallback parent if 1000 missing: attach under first ASSET header or null
UPDATE accounts a
SET "ParentAccountId" = (
  SELECT p."Id" FROM accounts p
  WHERE p."AccountType" = 'ASSET' AND p."IsPostingAccount" = false
  ORDER BY p."AccountCode"
  LIMIT 1
)
WHERE a."AccountCode" = '1410' AND a."ParentAccountId" IS NULL;

-- 2) Employee columns: advance sub-ledger + monthly allowance
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'AdvanceAccountId'
  ) THEN
    ALTER TABLE employees ADD COLUMN "AdvanceAccountId" UUID REFERENCES accounts("Id");
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'MonthlyAllowance'
  ) THEN
    ALTER TABLE employees ADD COLUMN "MonthlyAllowance" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
END$$;

-- 3) Payroll period: allow PAID (after clearing Salaries Payable)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'payroll_periods' AND constraint_name = 'payroll_periods_Status_check'
  ) THEN
    ALTER TABLE payroll_periods DROP CONSTRAINT "payroll_periods_Status_check";
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL;
END$$;

ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS payroll_periods_Status_check;
ALTER TABLE payroll_periods DROP CONSTRAINT IF EXISTS "payroll_periods_Status_check";

DO $$
BEGIN
  ALTER TABLE payroll_periods
    ADD CONSTRAINT payroll_periods_Status_check
    CHECK ("Status" IN ('OPEN', 'PROCESSED', 'POSTED', 'PAID'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END$$;

-- 4) Payroll entry: track advance recovery + payment settlement
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'AdvanceRecovered'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "AdvanceRecovered" NUMERIC(15,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'PaymentJournalEntryId'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "PaymentJournalEntryId" UUID;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_entries' AND column_name = 'PaidAt'
  ) THEN
    ALTER TABLE payroll_entries ADD COLUMN "PaidAt" TIMESTAMPTZ;
  END IF;
END$$;

-- 5) Employee advances (disbursements + shortage charges)
CREATE TABLE IF NOT EXISTS employee_advances (
  "Id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "EmployeeId"          UUID NOT NULL REFERENCES employees("Id"),
  "AdvanceDate"         DATE NOT NULL DEFAULT CURRENT_DATE,
  "Amount"              NUMERIC(15,2) NOT NULL CHECK ("Amount" > 0),
  "RemainingAmount"     NUMERIC(15,2) NOT NULL CHECK ("RemainingAmount" >= 0),
  "Reason"              VARCHAR(30) NOT NULL DEFAULT 'SALARY_ADVANCE'
                          CHECK ("Reason" IN ('SALARY_ADVANCE', 'CASH_SHORTAGE', 'OTHER')),
  "Status"              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                          CHECK ("Status" IN ('OPEN', 'PARTIAL', 'CLEARED')),
  "PaymentAccountCode"  VARCHAR(20) NOT NULL,
  "JournalEntryId"      UUID,
  "Notes"               TEXT,
  "CreatedBy"           UUID,
  "CreatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT employee_advances_remaining_le_amount
    CHECK ("RemainingAmount" <= "Amount")
);

CREATE INDEX IF NOT EXISTS idx_employee_advances_employee
  ON employee_advances("EmployeeId");
CREATE INDEX IF NOT EXISTS idx_employee_advances_status
  ON employee_advances("Status");

-- Recovery allocations (which payroll entry recovered which advance)
CREATE TABLE IF NOT EXISTS employee_advance_recoveries (
  "Id"              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "AdvanceId"       UUID NOT NULL REFERENCES employee_advances("Id"),
  "PayrollEntryId"  UUID NOT NULL REFERENCES payroll_entries("Id") ON DELETE CASCADE,
  "Amount"          NUMERIC(15,2) NOT NULL CHECK ("Amount" > 0),
  "CreatedAt"       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_advance_recoveries_advance
  ON employee_advance_recoveries("AdvanceId");
CREATE INDEX IF NOT EXISTS idx_advance_recoveries_entry
  ON employee_advance_recoveries("PayrollEntryId");

-- 6) Salary payment runs (clear 2400 → cash/bank)
CREATE TABLE IF NOT EXISTS payroll_payments (
  "Id"                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "PayrollPeriodId"     UUID NOT NULL REFERENCES payroll_periods("Id"),
  "PaymentDate"         DATE NOT NULL DEFAULT CURRENT_DATE,
  "PaymentAccountCode"  VARCHAR(20) NOT NULL,
  "TotalAmount"         NUMERIC(15,2) NOT NULL DEFAULT 0,
  "EmployeeCount"       INTEGER NOT NULL DEFAULT 0,
  "Notes"               TEXT,
  "CreatedBy"           UUID,
  "CreatedAt"           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payroll_payments_period
  ON payroll_payments("PayrollPeriodId");

-- 7) Grant PAYROLL source on liquidity + expense when AllowedSources is non-empty
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'PAYROLL'),
    "UpdatedAt" = NOW()
WHERE (
    "AccountCode" IN ('1012', '1020', '1030', '1040', '6000')
    OR "SystemAccountTag" IN ('BANK', 'MOBILE_MONEY', 'PETTY_CASH')
    OR "AccountCode" = '1410'
    OR "AccountCode" LIKE '1410-%'
    OR "AccountCode" = '2400'
    OR "AccountCode" LIKE '2400-%'
  )
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('PAYROLL' = ANY(COALESCE("AllowedSources", ARRAY[]::text[])));

INSERT INTO schema_version (version) VALUES (598) ON CONFLICT DO NOTHING;
