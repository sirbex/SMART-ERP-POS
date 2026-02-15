-- Cash Register Accounts Migration
-- Creates accounts needed for cash register variance tracking

-- Create Cash Shortage account (Expense)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsPostingAccount", "IsActive", "Level", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '6850', 'Cash Shortage', 'EXPENSE', 'DEBIT', true, true, 2, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6850');

-- Create Cash Overage/Other Income account (Revenue)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsPostingAccount", "IsActive", "Level", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '4900', 'Other Income', 'REVENUE', 'CREDIT', true, true, 2, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4900');

-- Verify the accounts were created
SELECT "AccountCode", "AccountName", "AccountType" 
FROM accounts 
WHERE "AccountCode" IN ('6850', '4900')
ORDER BY "AccountCode";
