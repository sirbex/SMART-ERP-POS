-- ============================================================
-- Migration 007: Supplier Payment GL Support
--
-- Fixes supplier payment GL posting by:
-- 1. Creating account 1030 (Bank Account) which was missing
-- 2. Updating AllowedSources for AP (2100) to include SUPPLIER_PAYMENT
-- 3. Updating AllowedSources for cash accounts to include SUPPLIER_PAYMENT
--    (for completeness — Rule B already skips CASH/CHECKING_ACCOUNT-tagged CR lines)
--
-- Must be applied to ALL tenant databases.
-- ============================================================

-- 1. Create account 1030 (Bank Account) if it does not exist
--    NOTE: Uses CHECKING_ACCOUNT tag (not CASH) to avoid unique constraint conflict with 1010.
--    The governance service Rule B/D bypasses are updated to include CHECKING_ACCOUNT.
INSERT INTO accounts (
    "Id",
    "AccountCode",
    "AccountName",
    "AccountType",
    "NormalBalance",
    "Level",
    "IsPostingAccount",
    "IsActive",
    "AllowedSources",
    "AllowManualPosting",
    "AllowAutomatedPosting",
    "SystemAccountTag",
    "CurrentBalance",
    "CreatedAt",
    "UpdatedAt"
)
SELECT
    gen_random_uuid(),
    '1030',
    'Bank Account',
    'ASSET',
    'DEBIT',
    1,
    TRUE,
    TRUE,
    ARRAY['PAYMENT_DEPOSIT', 'SUPPLIER_PAYMENT', 'SYSTEM_CORRECTION'],
    FALSE,
    TRUE,
    NULL,
    0,
    NOW(),
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM accounts WHERE "AccountCode" = '1030'
);

-- 2. Update AP (2100) AllowedSources to include SUPPLIER_PAYMENT
--    (needed so Rule B allows debiting AP from SUPPLIER_PAYMENT source)
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'SUPPLIER_PAYMENT'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" = '2100'
  AND NOT ('SUPPLIER_PAYMENT' = ANY("AllowedSources"));

-- 3. Update Cash (1010) AllowedSources to include SUPPLIER_PAYMENT
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'SUPPLIER_PAYMENT'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" = '1010'
  AND NOT ('SUPPLIER_PAYMENT' = ANY("AllowedSources"));

-- 4. Update Mobile Money (1040) AllowedSources to include SUPPLIER_PAYMENT
UPDATE accounts
SET
    "AllowedSources" = array_append("AllowedSources", 'SUPPLIER_PAYMENT'),
    "UpdatedAt"      = NOW()
WHERE "AccountCode" = '1040'
  AND NOT ('SUPPLIER_PAYMENT' = ANY("AllowedSources"));

-- Verify
SELECT "AccountCode", "AccountName", "AllowedSources"
FROM accounts
WHERE "AccountCode" IN ('1010', '1030', '1040', '2100')
ORDER BY "AccountCode";
