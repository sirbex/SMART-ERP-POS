-- ============================================================
-- Migration 008: Sale Refund GL Support
--
-- Fixes refund GL posting by adding SALES_REFUND to AllowedSources
-- for accounts touched during a refund journal entry:
--   DR Sales Revenue (4000)     -- reverse revenue
--   CR Cash (1010)              -- cash back to customer (CASH payment)
--   CR Mobile Money (1040)      -- cash back (MOBILE_MONEY payment)
--   CR AR (1200)                -- credit back (CREDIT payment)
--
-- Must be applied to ALL tenant databases.
-- ============================================================

-- Revenue (4000)
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '4000'
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));

-- Cash (1010)
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1010'
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));

-- Mobile Money (1040)
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1040'
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));

-- Accounts Receivable (1200)
UPDATE accounts
SET "AllowedSources" = array_append("AllowedSources", 'SALES_REFUND'),
    "UpdatedAt" = NOW()
WHERE "AccountCode" = '1200'
  AND NOT ('SALES_REFUND' = ANY("AllowedSources"));

-- Verify
SELECT "AccountCode", "AccountName", array_to_string("AllowedSources", ', ') AS sources
FROM accounts
WHERE "AccountCode" IN ('1010', '1040', '1200', '4000')
ORDER BY "AccountCode";
