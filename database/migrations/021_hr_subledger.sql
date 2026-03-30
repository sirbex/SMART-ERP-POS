-- =============================================================================
-- HR Sub-Ledger Upgrade Migration
-- 1. Create 2150 "Salaries Payable" header account (parent for employee sub-accounts)
-- 2. Add LedgerAccountId column to employees table
-- =============================================================================

-- 1. Create Salaries Payable header (non-posting, Level 1, under Current Liabilities)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance",
  "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
SELECT gen_random_uuid(), '2150', 'Salaries Payable', 'LIABILITY', 'CREDIT',
       (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000'), 1, false,
       true, 0, NOW(), NOW(), true
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2150');

-- 2. Add LedgerAccountId to employees (FK to accounts)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'LedgerAccountId'
  ) THEN
    ALTER TABLE employees ADD COLUMN "LedgerAccountId" UUID REFERENCES accounts("Id");
  END IF;
END$$;
