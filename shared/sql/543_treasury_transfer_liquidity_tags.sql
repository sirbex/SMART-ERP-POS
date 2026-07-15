-- Migration 543: Treasury Transfer liquidity tags (ADR-003 Phase 1C)
--
-- Distinguish liquidity account roles for TD-INV-6 while keeping AllowedSources
-- for TREASURY_TRANSFER. Undeposited Funds (1015) remains exclusive clearing.

-- Expand SystemAccountTag allow-list before assigning liquidity role tags
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

UPDATE accounts SET "SystemAccountTag" = 'CASH'
WHERE "AccountCode" = '1010';

UPDATE accounts SET "SystemAccountTag" = 'UNDEPOSITED_FUNDS'
WHERE "AccountCode" = '1015';

UPDATE accounts SET "SystemAccountTag" = 'CARD_CLEARING'
WHERE "AccountCode" = '1020';

UPDATE accounts SET "SystemAccountTag" = 'BANK'
WHERE "AccountCode" = '1030';

UPDATE accounts SET "SystemAccountTag" = 'MOBILE_MONEY'
WHERE "AccountCode" = '1040';

-- Petty cash (1012) if present
UPDATE accounts SET "SystemAccountTag" = 'PETTY_CASH'
WHERE "AccountCode" = '1012';

-- Ensure TREASURY_TRANSFER (+ family) on all liquidity codes
UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY[
        'TREASURY_DEPOSIT',
        'TREASURY_TRANSFER',
        'TREASURY_PETTY_CASH',
        'TREASURY_REVERSAL'
      ]::text[]
    )
  )
)
WHERE "AccountCode" IN ('1010', '1012', '1015', '1020', '1030', '1040')
   OR "SystemAccountTag" IN (
        'CASH', 'PETTY_CASH', 'UNDEPOSITED_FUNDS', 'BANK', 'CARD_CLEARING', 'MOBILE_MONEY'
      );

INSERT INTO schema_version (version) VALUES (543) ON CONFLICT DO NOTHING;
