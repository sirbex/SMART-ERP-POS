-- Migration 544: Petty Cash Split (ADR-003 Phase 1D)
--
-- 1012 Petty Cash is the dedicated float/expense fund.
-- 1015 Undeposited Funds means unsettled receipts ONLY.
-- 1010 Cash Drawer is till cash only.
--
-- Historical note: prior CASH_IN_FLOAT posts credited 1015 (misuse).
-- Optional reclass: npm run proof:petty-cash-reclass (dry-run / --live).

-- Ensure PETTY_CASH (and liquidity siblings) are legal system tags
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS chk_system_account_tag;
ALTER TABLE accounts ADD CONSTRAINT chk_system_account_tag CHECK (
  "SystemAccountTag" IS NULL OR "SystemAccountTag" IN (
    'CASH',
    'COGS',
    'INVENTORY',
    'OPENING_BALANCE_EQUITY',
    'UNDEPOSITED_FUNDS',
    'ACCOUNTS_RECEIVABLE',
    'ACCOUNTS_PAYABLE',
    'BANK',
    'MOBILE_MONEY',
    'CARD_CLEARING',
    'PETTY_CASH',
    'BAD_DEBT_EXPENSE',
    'TAX_PAYABLE',
    'TAX_RECEIVABLE',
    'WHT_PAYABLE',
    'WHT_RECEIVABLE',
    'AP',
    'PAYABLE',
    'GRIR',
    'SUPPLIER_RETURN_CLEARING'
  )
);

-- Ensure Petty Cash account
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "IsPostingAccount", "IsActive", "Level", "CurrentBalance",
  "AllowManualPosting", "SystemAccountTag", "CreatedAt", "UpdatedAt"
)
SELECT
  gen_random_uuid(), '1012', 'Petty Cash', 'ASSET', 'DEBIT',
  true, true, 2, 0,
  false, 'PETTY_CASH', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '1012');

-- Canonical names / tags
UPDATE accounts SET "AccountName" = 'Cash Drawer', "SystemAccountTag" = 'CASH', "UpdatedAt" = NOW()
WHERE "AccountCode" = '1010';

UPDATE accounts SET "AccountName" = 'Petty Cash', "SystemAccountTag" = 'PETTY_CASH',
       "AllowManualPosting" = false, "UpdatedAt" = NOW()
WHERE "AccountCode" = '1012';

UPDATE accounts SET "AccountName" = 'Undeposited Funds', "SystemAccountTag" = 'UNDEPOSITED_FUNDS',
       "UpdatedAt" = NOW()
WHERE "AccountCode" = '1015';

-- AllowedSources for petty cash (fund / replenish / expense / transfer / reversal)
UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY[
        'TREASURY_PETTY_CASH',
        'TREASURY_TRANSFER',
        'TREASURY_REVERSAL',
        'TREASURY_DEPOSIT',
        'SYSTEM_CORRECTION'
      ]::text[]
    )
  )
)
WHERE "AccountCode" IN ('1012', '1010', '1015', '1030');

-- Expense accounts commonly used with petty cash may receive TREASURY_PETTY_CASH
UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY['TREASURY_PETTY_CASH', 'EXPENSE_PAYMENT', 'SYSTEM_CORRECTION']::text[]
    )
  )
)
WHERE "AccountCode" IN ('6900', '6850')
   OR ("AccountType" = 'EXPENSE' AND "AccountCode" LIKE '6%');

COMMENT ON TABLE accounts IS
  'CoA — Phase 1D: 1010 Cash Drawer, 1012 Petty Cash, 1015 Undeposited Funds (receipts only)';

INSERT INTO schema_version (version) VALUES (544) ON CONFLICT DO NOTHING;
