-- 602: Employee ↔ User identity (Odoo/SAP-style, SamplePOS-smart)
-- - EmploymentType: PERMANENT | CASUAL | CONTRACT (default PERMANENT)
-- - EndDate: when employment ends (casuals leave, contracts expire)
-- - Unique UserId when linked (1 user ↔ 1 employee); NULL allowed for no-login staff

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'EmploymentType'
  ) THEN
    ALTER TABLE employees ADD COLUMN "EmploymentType" TEXT NOT NULL DEFAULT 'PERMANENT';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'EndDate'
  ) THEN
    ALTER TABLE employees ADD COLUMN "EndDate" DATE NULL;
  END IF;
END $$;

-- Normalize any legacy / unexpected values
UPDATE employees
SET "EmploymentType" = 'PERMANENT'
WHERE "EmploymentType" IS NULL
   OR "EmploymentType" NOT IN ('PERMANENT', 'CASUAL', 'CONTRACT');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'employees_employment_type_check'
  ) THEN
    ALTER TABLE employees
      ADD CONSTRAINT employees_employment_type_check
      CHECK ("EmploymentType" IN ('PERMANENT', 'CASUAL', 'CONTRACT'));
  END IF;
END $$;

-- One related user per employee (nullable = no login)
CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_userid_linked
  ON employees ("UserId")
  WHERE "UserId" IS NOT NULL;

COMMENT ON COLUMN employees."EmploymentType" IS 'PERMANENT | CASUAL | CONTRACT — HR master; login optional';
COMMENT ON COLUMN employees."EndDate" IS 'Set when employment ends; pair with Status=INACTIVE';
COMMENT ON COLUMN employees."UserId" IS 'Optional related login user; unique when set (1:1)';
