-- Migration 020: Add missing payment method accounts (1020, 1040)
--
-- PROBLEM:
--   Accounts 1020 (Credit Card Receipts) and 1040 (Mobile Money) are
--   referenced by glEntryService.ts for CARD and MOBILE_MONEY payment
--   methods:
--     - AccountCodes.CREDIT_CARD_RECEIPTS = '1020'
--     - AccountCodes.MOBILE_MONEY         = '1040'
--
--   These accounts were created locally only and were never applied to
--   production tenant databases via a migration. This causes:
--     "GL posting failed for sale SALE-XXXX: Account not found: 1040"
--     "GL posting failed for sale SALE-XXXX: Account not found: 1020"
--   for any CARD or MOBILE_MONEY payment.
--
-- FIX:
--   Insert both accounts under Current Assets (1000) idempotently.
--   Set governance columns (AllowManualPosting, AllowedSources, SystemAccountTag)
--   to allow automated posting from SALES_INVOICE and manual journal access.
--
-- IDEMPOTENT: Safe to run multiple times on any tenant DB.

BEGIN;

-- =========================================================
-- 1. Account 1020 — Credit Card Receipts
--    Asset account that receives debit when customer pays by card.
--    Journal: DR 1020 Credit Card Receipts / CR 4000 Revenue
-- =========================================================
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "IsActive", "CreatedAt", "UpdatedAt",
  "Level", "CurrentBalance", "IsPostingAccount", "AllowAutomatedPosting",
  "Description"
)
SELECT
  gen_random_uuid(),
  '1020',
  'Credit Card Receipts',
  'ASSET',
  'DEBIT',
  (SELECT "Id" FROM accounts WHERE "AccountCode" = '1000'),
  true,
  NOW(), NOW(),
  1, 0, true, true,
  'Holds card payment receipts until bank settlement'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1020');

-- =========================================================
-- 2. Account 1040 — Mobile Money
--    Asset account that receives debit when customer pays via mobile money.
--    Journal: DR 1040 Mobile Money / CR 4000 Revenue
-- =========================================================
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "ParentAccountId", "IsActive", "CreatedAt", "UpdatedAt",
  "Level", "CurrentBalance", "IsPostingAccount", "AllowAutomatedPosting",
  "Description"
)
SELECT
  gen_random_uuid(),
  '1040',
  'Mobile Money',
  'ASSET',
  'DEBIT',
  (SELECT "Id" FROM accounts WHERE "AccountCode" = '1000'),
  true,
  NOW(), NOW(),
  1, 0, true, true,
  'Mobile money receipts (MTN, Airtel, etc.)'
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1040');

-- =========================================================
-- 3. Set governance columns for 1020 and 1040
--    AllowedSources = '{}' means "no restriction — all sources allowed"
--    (Rule B in PostingGovernanceService only fires when AllowedSources
--     is a NON-EMPTY list. Empty = allow all.)
--    AllowManualPosting = true to allow accountant adjustments.
--    SystemAccountTag = NULL (no special system tag needed).
--
--    NOTE: These columns are guaranteed to exist because migration 019
--    (ADD COLUMN IF NOT EXISTS) must be applied before this migration.
-- =========================================================
DO $$
BEGIN
  -- Guard: only run if governance columns exist (migration 019 already applied)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'accounts' AND column_name = 'AllowManualPosting'
  ) THEN
    UPDATE accounts
    SET
      "AllowManualPosting" = TRUE,
      "AllowedSources"     = '{}',
      "SystemAccountTag"   = NULL
    WHERE "AccountCode" IN ('1020', '1040');
  END IF;
END $$;

-- =========================================================
-- 4. Track migration
-- =========================================================
INSERT INTO schema_version (version, applied_at)
SELECT 20, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 20);

COMMIT;
