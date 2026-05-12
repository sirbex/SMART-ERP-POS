-- Migration 016: Asset Registration Mode
--
-- Separates "New Asset Purchase" from "Opening Asset (pre-ERP)" registration.
--
-- Accounting law: registering a pre-existing asset is NOT a purchase.
-- Opening assets must credit Opening Balance Equity (3050), never Cash/Payables.
--
-- Changes:
--   1. Add registration_mode column to fixed_assets
--   2. Add OPENING_BALANCE_WIZARD to AllowedSources for Fixed Assets account (1500)
--      so that opening-balance asset entries can pass governance Rule B.
-- =============================================================================

-- 1. Add registration_mode to fixed_assets
--    Existing rows default to PURCHASE (correct — they were acquired via payment).
ALTER TABLE fixed_assets
  ADD COLUMN IF NOT EXISTS registration_mode VARCHAR(20) NOT NULL DEFAULT 'PURCHASE';

-- Constraint: only valid values allowed
ALTER TABLE fixed_assets
  DROP CONSTRAINT IF EXISTS chk_asset_registration_mode;
ALTER TABLE fixed_assets
  ADD CONSTRAINT chk_asset_registration_mode
    CHECK (registration_mode IN ('PURCHASE', 'OPENING'));

-- 2. Allow OPENING_BALANCE_WIZARD source for the Fixed Assets account (1500).
--    The governance service Rule B checks AllowedSources; without this, posting
--    Dr Fixed Assets / Cr Opening Balance Equity with source OPENING_BALANCE_WIZARD
--    would be blocked when the account has a non-empty AllowedSources list.
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'OPENING_BALANCE_WIZARD'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" = '1500'
  AND NOT ('OPENING_BALANCE_WIZARD' = ANY(COALESCE("AllowedSources", '{}'::text[])))
  AND array_length("AllowedSources", 1) > 0;

-- Verify
SELECT "AccountCode", "AccountName", "AllowedSources", "AllowManualPosting"
FROM accounts
WHERE "AccountCode" IN ('1500', '3050');
