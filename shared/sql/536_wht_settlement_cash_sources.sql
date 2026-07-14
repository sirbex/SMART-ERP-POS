-- Migration 536: WHT GL accounts + remittance cash AllowedSources
-- Ensures Tax Receivable (1250) / WHT Payable (2350), then allows
-- WHT_REMITTANCE to credit Cash and WHT_RECEIVABLE_RECOVERY to debit Cash.

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

UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY['WHT_REMITTANCE', 'WHT_RECEIVABLE_RECOVERY']::text[]
    )
  )
)
WHERE "SystemAccountTag" = 'CASH';

INSERT INTO schema_version (version) VALUES (536) ON CONFLICT DO NOTHING;

COMMIT;
