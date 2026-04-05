-- Add Revenue and Expense accounts to the Chart of Accounts
-- Required for Income Statement generation
-- Run: psql -U postgres -d pos_system -f shared/sql/add_income_expense_accounts.sql

-- Revenue Accounts (4xxx series)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive")
VALUES 
  (gen_random_uuid(), '4000', 'Revenue', 'REVENUE', 'CREDIT', NULL, 0, false, true),
  (gen_random_uuid(), '4100', 'Sales Revenue', 'REVENUE', 'CREDIT', NULL, 1, true, true),
  (gen_random_uuid(), '4200', 'Service Revenue', 'REVENUE', 'CREDIT', NULL, 1, true, true),
  (gen_random_uuid(), '4300', 'Interest Income', 'REVENUE', 'CREDIT', NULL, 1, true, true),
  (gen_random_uuid(), '4900', 'Other Income', 'REVENUE', 'CREDIT', NULL, 1, true, true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- Cost of Goods Sold (5xxx series)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive")
VALUES 
  (gen_random_uuid(), '5000', 'Cost of Goods Sold', 'EXPENSE', 'DEBIT', NULL, 0, false, true),
  (gen_random_uuid(), '5100', 'Product Cost', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '5200', 'Inventory Adjustments', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '5300', 'Purchase Discounts', 'EXPENSE', 'DEBIT', NULL, 1, true, true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- Operating Expenses (6xxx series)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive")
VALUES 
  (gen_random_uuid(), '6000', 'Operating Expenses', 'EXPENSE', 'DEBIT', NULL, 0, false, true),
  (gen_random_uuid(), '6100', 'Salaries and Wages', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6200', 'Rent Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6300', 'Utilities Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6400', 'Insurance Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6500', 'Depreciation Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6600', 'Office Supplies', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6700', 'Marketing Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6800', 'Professional Fees', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '6900', 'Miscellaneous Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- Other Expenses (7xxx series)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive")
VALUES 
  (gen_random_uuid(), '7000', 'Other Expenses', 'EXPENSE', 'DEBIT', NULL, 0, false, true),
  (gen_random_uuid(), '7100', 'Interest Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '7200', 'Bank Fees', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '7300', 'Loss on Asset Disposal', 'EXPENSE', 'DEBIT', NULL, 1, true, true),
  (gen_random_uuid(), '7900', 'Other Non-Operating Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- Add Retained Earnings to Equity
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive")
VALUES 
  (gen_random_uuid(), '3100', 'Retained Earnings', 'EQUITY', 'CREDIT', NULL, 1, true, true),
  (gen_random_uuid(), '3200', 'Owner Capital', 'EQUITY', 'CREDIT', NULL, 1, true, true),
  (gen_random_uuid(), '3300', 'Owner Drawings', 'EQUITY', 'DEBIT', NULL, 1, true, true)
ON CONFLICT ("AccountCode") DO NOTHING;

-- Verify the accounts were added
SELECT "AccountCode", "AccountName", "AccountType", "IsPostingAccount"
FROM accounts 
WHERE "AccountType" IN ('REVENUE', 'EXPENSE')
ORDER BY "AccountCode";
