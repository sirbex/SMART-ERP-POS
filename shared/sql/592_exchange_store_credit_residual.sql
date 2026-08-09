-- Migration 592: Exchange residual payout tracking + store credit GL account
-- Store credit from product exchange is a refund liability (2210), distinct from
-- cash advances in Customer Deposits (2200).

BEGIN;

ALTER TABLE sale_refunds
  ADD COLUMN IF NOT EXISTS exchange_residual_payout_amount DECIMAL(15, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN sale_refunds.exchange_residual_payout_amount IS
  'Cash/card residual paid out after EXCHANGE credit not fully used on replacement (liability cleared).';

-- 2210 Store Credit Liability (return/exchange hold; not cash advance)
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount",
  "AllowAutomatedPosting", "CurrentBalance", "CreatedAt", "UpdatedAt"
)
SELECT
  gen_random_uuid(),
  '2210',
  'Store Credit / Exchange Liability',
  'LIABILITY',
  'CREDIT',
  true,
  (SELECT "ParentAccountId" FROM accounts WHERE "AccountCode" = '2200' LIMIT 1),
  'Unapplied product-exchange / return store credit owed to customers (not cash advances)',
  1,
  true,
  true,
  0,
  NOW(),
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM accounts WHERE "AccountCode" = '2210'
);

COMMIT;
