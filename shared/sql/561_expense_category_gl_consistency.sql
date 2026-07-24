-- Migration 561: Expense category ↔ GL consistency
--
-- Fixes:
-- 1. Dual category codes (OFFICE vs OFFICE_SUPPLIES, PROFESSIONAL vs PROFESSIONAL_SERVICES)
-- 2. Missing / wrong expense_categories.account_id links to CoA
-- 3. expenses.category_id / account_id drift from category text
-- 4. Restrictive CHECK on expenses.category blocking DB-driven codes
--
-- CoA mapping (canonical — matches AccountCodes + add_missing_accounts.sql):
--   6000 Salaries, 6100 Rent, 6200 Utilities, 6300 Marketing, 6400 Office,
--   6600 Insurance, 6700 Professional, 6800 Travel/Meals/Fuel, 6900 General

-- ---------------------------------------------------------------------------
-- 1. Ensure linking columns exist
-- ---------------------------------------------------------------------------
ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts("Id");

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES expense_categories(id);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES accounts("Id");

-- Drop legacy CHECK that only allowed TypeScript enum codes (blocks OFFICE, PROFESSIONAL, …)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE t.relname = 'expenses'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE expenses DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Ensure canonical categories exist (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO expense_categories (name, code, description, is_active)
VALUES
  ('Office Supplies', 'OFFICE', 'General office supplies and materials', true),
  ('Travel', 'TRAVEL', 'Business travel expenses', true),
  ('Meals & Entertainment', 'MEALS', 'Business meals and client entertainment', true),
  ('Fuel & Transportation', 'FUEL', 'Vehicle fuel and transportation costs', true),
  ('Utilities', 'UTILITIES', 'Electricity, water, internet, phone', true),
  ('Maintenance & Repairs', 'MAINTENANCE', 'Equipment and facility maintenance', true),
  ('Marketing & Advertising', 'MARKETING', 'Marketing campaigns and advertising', true),
  ('Equipment', 'EQUIPMENT', 'Office and business equipment', true),
  ('Software & Licenses', 'SOFTWARE', 'Software subscriptions and licenses', true),
  ('Professional Services', 'PROFESSIONAL', 'Consulting, legal, and professional fees', true),
  ('Accommodation', 'ACCOMMODATION', 'Hotel and accommodation expenses', true),
  ('Training & Development', 'TRAINING', 'Employee training and development', true),
  ('Employee Allowances', 'ALLOWANCE', 'Employee allowances and reimbursements', true),
  ('Other', 'OTHER', 'Miscellaneous business expenses', true),
  ('Rent', 'RENT', 'Facility and equipment rent', true),
  ('Salaries & Wages', 'SALARIES', 'Payroll and wage expenses', true),
  ('Insurance', 'INSURANCE', 'Business insurance premiums', true)
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Link every category code (canonical + aliases) to CoA
-- ---------------------------------------------------------------------------
UPDATE expense_categories ec
SET account_id = a."Id",
    updated_at = NOW()
FROM accounts a
WHERE a."AccountCode" = CASE UPPER(ec.code)
  WHEN 'OFFICE' THEN '6400'
  WHEN 'OFFICE_SUPPLIES' THEN '6400'
  WHEN 'TRAVEL' THEN '6800'
  WHEN 'MEALS' THEN '6800'
  WHEN 'FUEL' THEN '6800'
  WHEN 'ACCOMMODATION' THEN '6800'
  WHEN 'UTILITIES' THEN '6200'
  WHEN 'SALARIES' THEN '6000'
  WHEN 'ALLOWANCE' THEN '6000'
  WHEN 'RENT' THEN '6100'
  WHEN 'MARKETING' THEN '6300'
  WHEN 'INSURANCE' THEN '6600'
  WHEN 'PROFESSIONAL' THEN '6700'
  WHEN 'PROFESSIONAL_SERVICES' THEN '6700'
  WHEN 'MAINTENANCE' THEN '6900'
  WHEN 'EQUIPMENT' THEN '6900'
  WHEN 'SOFTWARE' THEN '6900'
  WHEN 'TRAINING' THEN '6900'
  WHEN 'OTHER' THEN '6900'
  WHEN 'GENERAL' THEN '6900'
  ELSE NULL
END
AND (ec.account_id IS DISTINCT FROM a."Id");

-- Default unmapped categories → General Expense 6900
UPDATE expense_categories ec
SET account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '6900' LIMIT 1),
    updated_at = NOW()
WHERE ec.account_id IS NULL
  AND EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6900');

-- ---------------------------------------------------------------------------
-- 4. Soft-deactivate duplicate alias categories when canonical exists
--    (keep rows for FK history; new expenses should use short codes)
-- ---------------------------------------------------------------------------
UPDATE expense_categories alias_row
SET is_active = false,
    updated_at = NOW()
FROM expense_categories canon
WHERE alias_row.code IN ('OFFICE_SUPPLIES', 'PROFESSIONAL_SERVICES', 'GENERAL')
  AND (
    (alias_row.code = 'OFFICE_SUPPLIES' AND canon.code = 'OFFICE')
    OR (alias_row.code = 'PROFESSIONAL_SERVICES' AND canon.code = 'PROFESSIONAL')
    OR (alias_row.code = 'GENERAL' AND canon.code = 'OTHER')
  )
  AND alias_row.is_active = true;

-- ---------------------------------------------------------------------------
-- 5. Backfill expenses.category_id from category text (+ aliases)
-- ---------------------------------------------------------------------------
UPDATE expenses e
SET category_id = resolved.id
FROM (
  SELECT e2.id AS expense_id, COALESCE(exact.id, alias_target.id, other.id) AS id
  FROM expenses e2
  LEFT JOIN expense_categories exact
    ON UPPER(exact.code) = UPPER(TRIM(e2.category))
  LEFT JOIN expense_categories alias_target
    ON alias_target.code = CASE UPPER(TRIM(e2.category))
      WHEN 'OFFICE_SUPPLIES' THEN 'OFFICE'
      WHEN 'PROFESSIONAL_SERVICES' THEN 'PROFESSIONAL'
      WHEN 'GENERAL' THEN 'OTHER'
      ELSE NULL
    END
  LEFT JOIN expense_categories other
    ON other.code = 'OTHER'
) resolved
WHERE e.id = resolved.expense_id
  AND resolved.id IS NOT NULL
  AND (e.category_id IS NULL OR e.category_id IS DISTINCT FROM resolved.id);

-- Prefer joining through category_id when present but text mismatched
UPDATE expenses e
SET category = ec.code
FROM expense_categories ec
WHERE e.category_id = ec.id
  AND (e.category IS NULL OR UPPER(TRIM(e.category)) IS DISTINCT FROM UPPER(ec.code));

-- ---------------------------------------------------------------------------
-- 6. Sync expenses.account_id from category (reporting + future posting accuracy)
-- ---------------------------------------------------------------------------
UPDATE expenses e
SET account_id = ec.account_id
FROM expense_categories ec
WHERE e.category_id = ec.id
  AND ec.account_id IS NOT NULL
  AND (e.account_id IS DISTINCT FROM ec.account_id);

UPDATE expenses e
SET account_id = (SELECT "Id" FROM accounts WHERE "AccountCode" = '6900' LIMIT 1)
WHERE e.account_id IS NULL
  AND EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6900');

CREATE INDEX IF NOT EXISTS idx_expense_categories_account_id ON expense_categories(account_id);
CREATE INDEX IF NOT EXISTS idx_expenses_account_id ON expenses(account_id);

INSERT INTO schema_version (version) VALUES (561) ON CONFLICT DO NOTHING;
