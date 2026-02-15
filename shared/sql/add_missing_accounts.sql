-- ============================================================================
-- Migration: Add Missing Accounts for Full Accounting Integration
-- Date: 2025-12-25
-- Purpose: Add REVENUE and EXPENSE accounts to complete chart of accounts
-- ============================================================================

-- REVENUE ACCOUNTS (4xxx series)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", 
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
  "CurrentBalance", "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
VALUES 
  (gen_random_uuid(), '4000', 'Sales Revenue', 'REVENUE', 'CREDIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '4100', 'Service Revenue', 'REVENUE', 'CREDIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '4200', 'Other Income', 'REVENUE', 'CREDIT', NULL, 1, true, true, 0, NOW(), NOW(), true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- COST OF GOODS SOLD (5xxx series)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", 
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
  "CurrentBalance", "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
VALUES 
  (gen_random_uuid(), '5000', 'Cost of Goods Sold', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- OPERATING EXPENSE ACCOUNTS (6xxx series)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", 
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
  "CurrentBalance", "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
VALUES 
  (gen_random_uuid(), '6000', 'Salaries & Wages', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6100', 'Rent Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6200', 'Utilities', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6300', 'Marketing & Advertising', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6400', 'Office Supplies', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6500', 'Depreciation Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6600', 'Insurance', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6700', 'Professional Fees', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6800', 'Travel & Entertainment', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '6900', 'General Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- OTHER EXPENSE/INCOME ACCOUNTS (7xxx series)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", 
  "ParentAccountId", "Level", "IsPostingAccount", "IsActive",
  "CurrentBalance", "CreatedAt", "UpdatedAt", "AllowAutomatedPosting"
)
VALUES 
  (gen_random_uuid(), '7000', 'Interest Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true),
  (gen_random_uuid(), '7100', 'Bank Charges', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW(), true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- Verify accounts were added
SELECT "AccountCode", "AccountName", "AccountType", "NormalBalance" 
FROM accounts 
ORDER BY "AccountCode";
