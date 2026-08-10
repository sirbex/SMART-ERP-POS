-- Migration 597: Allow DEPOSIT_APPLICATION on AR (1200) and Customer Deposits (2200)
--
-- Applying a customer prepayment to a sale posts:
--   DR 2200 Customer Deposits / CR 1200 AR
-- source = DEPOSIT_APPLICATION (not PAYMENT_RECEIPT).
-- Cash already cleared into Undeposited Funds when the deposit was taken.
--
-- Idempotent: safe on all tenant DBs.

UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'DEPOSIT_APPLICATION'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1200'
  AND "IsActive" = TRUE
  AND NOT ('DEPOSIT_APPLICATION' = ANY("AllowedSources"));

UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'DEPOSIT_APPLICATION'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '2200'
  AND "IsActive" = TRUE
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('DEPOSIT_APPLICATION' = ANY("AllowedSources"));

-- Optional CoA tag for clearer governance Rule E matching
UPDATE accounts
SET "SystemAccountTag" = 'CUSTOMER_DEPOSITS',
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '2200'
  AND "IsActive" = TRUE
  AND ("SystemAccountTag" IS NULL OR "SystemAccountTag" = '');

INSERT INTO schema_version (version) VALUES (597) ON CONFLICT DO NOTHING;
