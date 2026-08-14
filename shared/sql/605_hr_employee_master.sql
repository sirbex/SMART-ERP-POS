-- =============================================================================
-- Migration 605: Enterprise employee master (identity, kin, payment)
-- Complements 604 bank/NSSF/TIN. SSOT: shared/hr/employeeMasterSsot.ts
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'EmployeeNumber') THEN
    ALTER TABLE employees ADD COLUMN "EmployeeNumber" VARCHAR(40);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'NationalId') THEN
    ALTER TABLE employees ADD COLUMN "NationalId" VARCHAR(40);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'DateOfBirth') THEN
    ALTER TABLE employees ADD COLUMN "DateOfBirth" DATE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'Gender') THEN
    ALTER TABLE employees ADD COLUMN "Gender" VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'Nationality') THEN
    ALTER TABLE employees ADD COLUMN "Nationality" VARCHAR(80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'MaritalStatus') THEN
    ALTER TABLE employees ADD COLUMN "MaritalStatus" VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'AddressLine1') THEN
    ALTER TABLE employees ADD COLUMN "AddressLine1" VARCHAR(500);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'AddressDistrict') THEN
    ALTER TABLE employees ADD COLUMN "AddressDistrict" VARCHAR(120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'NextOfKinName') THEN
    ALTER TABLE employees ADD COLUMN "NextOfKinName" VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'NextOfKinPhone') THEN
    ALTER TABLE employees ADD COLUMN "NextOfKinPhone" VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'NextOfKinRelation') THEN
    ALTER TABLE employees ADD COLUMN "NextOfKinRelation" VARCHAR(80);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'BankBranch') THEN
    ALTER TABLE employees ADD COLUMN "BankBranch" VARCHAR(120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'BankAccountName') THEN
    ALTER TABLE employees ADD COLUMN "BankAccountName" VARCHAR(255);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'MobileMoneyNumber') THEN
    ALTER TABLE employees ADD COLUMN "MobileMoneyNumber" VARCHAR(40);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'MobileMoneyProvider') THEN
    ALTER TABLE employees ADD COLUMN "MobileMoneyProvider" VARCHAR(20);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'PreferredPaymentMethod') THEN
    ALTER TABLE employees ADD COLUMN "PreferredPaymentMethod" VARCHAR(20);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_gender_check') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_gender_check
      CHECK ("Gender" IS NULL OR "Gender" IN ('MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_marital_check') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_marital_check
      CHECK ("MaritalStatus" IS NULL OR "MaritalStatus" IN ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_momo_provider_check') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_momo_provider_check
      CHECK ("MobileMoneyProvider" IS NULL OR "MobileMoneyProvider" IN ('MTN', 'AIRTEL', 'OTHER'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'employees_pay_method_check') THEN
    ALTER TABLE employees ADD CONSTRAINT employees_pay_method_check
      CHECK ("PreferredPaymentMethod" IS NULL OR "PreferredPaymentMethod" IN ('BANK', 'MOBILE_MONEY', 'CASH', 'PETTY_CASH'));
  END IF;
END$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_employee_number
  ON employees ("EmployeeNumber")
  WHERE "EmployeeNumber" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_employees_national_id
  ON employees ("NationalId")
  WHERE "NationalId" IS NOT NULL;

COMMENT ON COLUMN employees."NationalId" IS 'Uganda NIN / national ID — compliance master';
COMMENT ON COLUMN employees."NextOfKinName" IS 'Emergency / next of kin contact';
COMMENT ON COLUMN employees."PreferredPaymentMethod" IS 'BANK | MOBILE_MONEY | CASH | PETTY_CASH — salary remittance';
