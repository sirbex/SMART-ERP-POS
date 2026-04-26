-- Migration 015: Asset accounting GL governance
-- Adds PURCHASE_BILL to account 1010 (Cash) AllowedSources so that:
--   - Asset acquisition via cash (DR Fixed Asset, CR Cash) is permitted
--   - Asset disposal proceeds (DR Cash, CR Fixed Asset) are permitted
-- Both transactions use source='PURCHASE_BILL' in assetService.ts.

-- Account 1010 has a restricted AllowedSources list; append PURCHASE_BILL if missing.
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'PURCHASE_BILL'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1010'
  AND NOT ('PURCHASE_BILL' = ANY("AllowedSources"))
  AND array_length("AllowedSources", 1) > 0;

-- Confirm result
SELECT "AccountCode", "AccountName", "AllowedSources"
FROM accounts
WHERE "AccountCode" = '1010';
