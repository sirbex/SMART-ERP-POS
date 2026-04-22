-- Migration: Add Mobile Money asset account (1040)
-- Separates Mobile Money from Cash (1010) as a distinct asset class

BEGIN;

INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "ParentAccountId", "IsActive", "CreatedAt", "UpdatedAt", "Level", "CurrentBalance", "IsPostingAccount", "AllowAutomatedPosting", "Description")
VALUES (
  gen_random_uuid(),
  '1040',
  'Mobile Money',
  'ASSET',
  'DEBIT',
  (SELECT "Id" FROM accounts WHERE "AccountCode" = '1000'),
  true,
  NOW(), NOW(), 1, 0, true, true,
  'Mobile money receipts (MTN, Airtel, etc.)'
) ON CONFLICT ("AccountCode") DO NOTHING;

COMMIT;
