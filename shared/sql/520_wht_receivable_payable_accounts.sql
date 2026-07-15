-- Ensure WHT GL accounts exist (customer Tax Receivable + supplier WHT Payable).
-- Safe to re-run. Mirrors SamplePOS.Server ensureWhtAccounts().

BEGIN;

INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "IsActive", "CreatedAt", "UpdatedAt", "Level", "CurrentBalance",
  "IsPostingAccount", "AllowAutomatedPosting", "Description"
)
VALUES (
  gen_random_uuid(),
  '1250',
  'Tax Receivable',
  'ASSET',
  'DEBIT',
  true,
  NOW(), NOW(), 1, 0,
  true, true,
  'Withholding tax withheld by customers; recoverable from the tax authority (URA)'
)
ON CONFLICT ("AccountCode") DO NOTHING;

INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "IsActive", "CreatedAt", "UpdatedAt", "Level", "CurrentBalance",
  "IsPostingAccount", "AllowAutomatedPosting", "Description"
)
VALUES (
  gen_random_uuid(),
  '2350',
  'Withholding Tax Payable',
  'LIABILITY',
  'CREDIT',
  true,
  NOW(), NOW(), 1, 0,
  true, true,
  'Withholding tax deducted from supplier payments; remittable to URA'
)
ON CONFLICT ("AccountCode") DO NOTHING;

COMMIT;
