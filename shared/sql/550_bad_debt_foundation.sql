-- Migration 550: Bad Debt Write-off Foundation (ADR-006 Phase 4A)
--
-- Feature flag + CoA 5210 Bad Debt Expense + AR_WRITEOFF AllowedSources stubs.
-- Flag-off default: bad_debt_writeoff_enabled = FALSE → no behavior change.
-- Posting engine / documents land in Phase 4B.
-- Related: docs/architecture/BAD_DEBT_ADR.md

ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS bad_debt_writeoff_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_settings.bad_debt_writeoff_enabled IS
  'ADR-006 Phase 4A: when true, AR uncollectible clears must post via AR_WRITEOFF document';

-- Seed Bad Debt Expense (5210)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "IsPostingAccount", "IsActive", "Level", "CurrentBalance",
  "AllowManualPosting", "SystemAccountTag", "Description",
  "CreatedAt", "UpdatedAt"
)
SELECT
  gen_random_uuid(),
  '5210',
  'Bad Debt Expense',
  'EXPENSE',
  'DEBIT',
  true,
  true,
  2,
  0,
  false,
  'BAD_DEBT_EXPENSE',
  'ADR-006: uncollectible customer receivables (direct write-off)',
  NOW(),
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5210');

UPDATE accounts
SET "AccountName" = 'Bad Debt Expense',
    "SystemAccountTag" = 'BAD_DEBT_EXPENSE',
    "AllowManualPosting" = false,
    "IsPostingAccount" = true,
    "IsActive" = true,
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '5210';

-- Accounts Receivable (1200) — allow governed write-off / reversal credits
UPDATE accounts
SET
  "AllowedSources" = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(accounts."AllowedSources", ARRAY[]::text[])
        || ARRAY['AR_WRITEOFF', 'AR_WRITEOFF_REVERSAL']::text[]
      )
    )
  ),
  "UpdatedAt" = NOW()
WHERE "AccountCode" = '1200'
  AND "IsActive" = TRUE;

-- Bad Debt Expense (5210) — allow write-off / reversal debits (+ system correction)
UPDATE accounts
SET
  "AllowedSources" = (
    SELECT ARRAY(
      SELECT DISTINCT unnest(
        COALESCE(accounts."AllowedSources", ARRAY[]::text[])
        || ARRAY['AR_WRITEOFF', 'AR_WRITEOFF_REVERSAL', 'SYSTEM_CORRECTION']::text[]
      )
    )
  ),
  "UpdatedAt" = NOW()
WHERE "AccountCode" = '5210';

INSERT INTO schema_version (version) VALUES (550) ON CONFLICT DO NOTHING;
