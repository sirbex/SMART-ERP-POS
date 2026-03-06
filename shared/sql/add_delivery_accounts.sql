-- Add Delivery Revenue and Delivery Expense accounts
-- Required for delivery fee GL postings
-- Run: psql -U postgres -d pos_system -f shared/sql/add_delivery_accounts.sql

-- Delivery Revenue (4500)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance", "CreatedAt", "UpdatedAt")
VALUES
  (gen_random_uuid(), '4500', 'Delivery Revenue', 'REVENUE', 'CREDIT', NULL, 1, true, true, 0, NOW(), NOW())
ON CONFLICT ("AccountCode") DO NOTHING;

-- Delivery / Transport Expense (6750)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance", "CreatedAt", "UpdatedAt")
VALUES
  (gen_random_uuid(), '6750', 'Delivery Expense', 'EXPENSE', 'DEBIT', NULL, 1, true, true, 0, NOW(), NOW())
ON CONFLICT ("AccountCode") DO NOTHING;

-- Verify
SELECT "AccountCode", "AccountName", "AccountType", "IsActive"
FROM accounts
WHERE "AccountCode" IN ('4500', '6750')
ORDER BY "AccountCode";
