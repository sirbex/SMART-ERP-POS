-- Create inventory adjustment accounts
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '5110', 'Inventory Shrinkage', 'EXPENSE', 'DEBIT', NULL, 1, TRUE, TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5110');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '5120', 'Inventory Damage', 'EXPENSE', 'DEBIT', NULL, 1, TRUE, TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5120');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '5130', 'Inventory Expiry', 'EXPENSE', 'DEBIT', NULL, 1, TRUE, TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5130');

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "Level", "IsPostingAccount", "IsActive", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '4110', 'Inventory Overage', 'REVENUE', 'CREDIT', NULL, 1, TRUE, TRUE, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '4110');

-- Verify
SELECT "AccountCode", "AccountName", "AccountType", "NormalBalance" 
FROM accounts 
WHERE "AccountCode" IN ('5110', '5120', '5130', '4110')
ORDER BY "AccountCode";
