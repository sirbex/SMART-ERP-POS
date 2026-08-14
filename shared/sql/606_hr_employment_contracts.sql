-- =============================================================================
-- Migration 606: Employment contracts lifecycle (Odoo hr.contract / SAP HCM)
-- SSOT: shared/hr/employmentContractSsot.ts
-- Adds INTERN; versioned employee_contracts; sign / renew / convert / expire
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_employment_type_check') THEN
    ALTER TABLE employees DROP CONSTRAINT employees_employment_type_check;
  END IF;
END$$;

UPDATE employees
SET "EmploymentType" = 'PERMANENT'
WHERE "EmploymentType" IS NULL
   OR "EmploymentType" NOT IN ('PERMANENT', 'CASUAL', 'CONTRACT', 'INTERN');

ALTER TABLE employees
  ADD CONSTRAINT employees_employment_type_check
  CHECK ("EmploymentType" IN ('PERMANENT', 'CASUAL', 'CONTRACT', 'INTERN'));

COMMENT ON COLUMN employees."EmploymentType" IS
  'PERMANENT | CASUAL | CONTRACT | INTERN — current engagement; history in employee_contracts';

CREATE TABLE IF NOT EXISTS employee_contracts (
  "Id"                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "EmployeeId"        UUID NOT NULL REFERENCES employees("Id") ON DELETE CASCADE,
  "EmploymentType"    TEXT NOT NULL
                      CHECK ("EmploymentType" IN ('PERMANENT', 'CASUAL', 'CONTRACT', 'INTERN')),
  "StartDate"         DATE NOT NULL,
  "EndDate"           DATE,
  "ProbationEndDate"  DATE,
  "Status"            TEXT NOT NULL DEFAULT 'DRAFT'
                      CHECK ("Status" IN ('DRAFT', 'ACTIVE', 'EXPIRED', 'RENEWED', 'CONVERTED', 'TERMINATED')),
  "SignedAt"          TIMESTAMPTZ,
  "SignedByUserId"    UUID,
  "ContractNumber"    VARCHAR(60),
  "Notes"             TEXT,
  "PreviousContractId" UUID REFERENCES employee_contracts("Id"),
  "CreatedAt"         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "CreatedByUserId"   UUID,
  CONSTRAINT employee_contracts_dates_chk CHECK (
    "EndDate" IS NULL OR "EndDate" >= "StartDate"
  ),
  CONSTRAINT employee_contracts_probation_chk CHECK (
    "ProbationEndDate" IS NULL OR "ProbationEndDate" >= "StartDate"
  )
);

CREATE INDEX IF NOT EXISTS idx_employee_contracts_employee
  ON employee_contracts ("EmployeeId");

CREATE INDEX IF NOT EXISTS idx_employee_contracts_status
  ON employee_contracts ("Status");

CREATE INDEX IF NOT EXISTS idx_employee_contracts_end
  ON employee_contracts ("EndDate")
  WHERE "EndDate" IS NOT NULL AND "Status" = 'ACTIVE';

-- At most one ACTIVE or DRAFT open engagement per employee
CREATE UNIQUE INDEX IF NOT EXISTS uq_employee_contracts_open
  ON employee_contracts ("EmployeeId")
  WHERE "Status" IN ('DRAFT', 'ACTIVE');

COMMENT ON TABLE employee_contracts IS
  'Versioned employment engagements — create/sign/renew/convert/expire (not company exit)';

-- Backfill open engagement for existing active employees (idempotent)
INSERT INTO employee_contracts (
  "EmployeeId", "EmploymentType", "StartDate", "EndDate", "Status", "Notes", "SignedAt"
)
SELECT
  e."Id",
  e."EmploymentType",
  e."HireDate",
  CASE
    WHEN e."EmploymentType" IN ('CONTRACT', 'INTERN') THEN e."EndDate"
    ELSE NULL
  END,
  'ACTIVE',
  'Backfill from employee master (606)',
  NOW()
FROM employees e
WHERE e."Status" = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM employee_contracts c
    WHERE c."EmployeeId" = e."Id" AND c."Status" IN ('DRAFT', 'ACTIVE')
  );
