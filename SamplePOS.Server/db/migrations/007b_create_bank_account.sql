-- ============================================================
-- Migration 007b: Create Bank Account (1030) with CHECKING_ACCOUNT tag
--
-- 007 already ran the AllowedSources UPDATEs on pos_system.
-- This creates account 1030 using CHECKING_ACCOUNT tag to avoid
-- the unique constraint conflict on SystemAccountTag = 'CASH'.
--
-- Must be applied to ALL tenant databases.
-- ============================================================

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

-- Verify
SELECT "AccountCode", "AccountName", "SystemAccountTag", array_to_string("AllowedSources", ', ') AS sources
FROM accounts
WHERE "AccountCode" IN ('1010', '1030', '1040', '2100')
ORDER BY "AccountCode";
