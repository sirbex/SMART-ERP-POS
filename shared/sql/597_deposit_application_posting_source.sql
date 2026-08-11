-- Migration 597: Allow DEPOSIT_APPLICATION on AR (1200) and Customer Deposits (2200)
--
-- Applying a customer prepayment to a sale posts:
--   DR 2200 Customer Deposits / CR 1200 AR
-- source = DEPOSIT_APPLICATION (not PAYMENT_RECEIPT).
-- Cash already cleared into Undeposited Funds when the deposit was taken.
--
-- Governance matches account code 2200 (and optional tag CUSTOMER_DEPOSITS if CoA
-- already allows it). Do NOT invent SystemAccountTag values outside chk_system_account_tag.
--
-- Idempotent: safe on all tenant DBs. Safe to re-run after failed 597 (tag attempt rolled back).

UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'DEPOSIT_APPLICATION'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1200'
  AND COALESCE("IsActive", TRUE) = TRUE
  AND NOT ('DEPOSIT_APPLICATION' = ANY(COALESCE("AllowedSources", ARRAY[]::text[])));

UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'DEPOSIT_APPLICATION'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '2200'
  AND COALESCE("IsActive", TRUE) = TRUE
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('DEPOSIT_APPLICATION' = ANY(COALESCE("AllowedSources", ARRAY[]::text[])));

INSERT INTO schema_version (version) VALUES (597) ON CONFLICT DO NOTHING;
