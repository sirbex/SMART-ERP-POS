-- =====================================================================
-- Supplier Return Clearing account (2160) — required for post-invoice RGRN
-- =====================================================================
-- Post-invoice return GRNs debit 2160 (not 2150 GR/IR Clearing).
-- Without this account, posting RGRN on invoiced GRs fails with "Account not found: 2160".
-- Idempotent: safe on every tenant DB at deploy.

BEGIN;

INSERT INTO accounts (
    "Id",
    "AccountCode",
    "AccountName",
    "AccountType",
    "NormalBalance",
    "IsActive",
    "ParentAccountId",
    "Description",
    "Level",
    "IsPostingAccount",
    "CurrentBalance",
    "CreatedAt",
    "UpdatedAt"
)
SELECT
    gen_random_uuid(),
    '2160',
    'Supplier Return Clearing',
    'LIABILITY',
    'CREDIT',
    true,
    (SELECT "ParentAccountId" FROM accounts WHERE "AccountCode" = '2150' LIMIT 1),
    'Clearing for supplier returns after GR is invoiced; cleared by Supplier Credit Note (SAP-style)',
    1,
    true,
    0,
    NOW(),
    NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2160');

COMMIT;
