-- 558: Allow multiple BANK / liquidity role tags on CoA
--
-- uidx_accounts_system_tag historically enforced ONE account per SystemAccountTag.
-- That is correct for singleton roles (OBE, AR, AP, Undeposited Funds, …) but
-- breaks multi-bank books: production already stamps BANK on 1030 (migration 543),
-- so "Create & use this GL" with bankLiquidity=true (or ensureBankGlLiquidityTag)
-- fails with:
--   duplicate key value violates unique constraint "uidx_accounts_system_tag"
--
-- Liquidity role tags may appear on many accounts; singleton tags stay unique.

DROP INDEX IF EXISTS uidx_accounts_system_tag;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_accounts_system_tag_singleton
  ON accounts ("SystemAccountTag")
  WHERE "SystemAccountTag" IS NOT NULL
    AND "SystemAccountTag" IN (
      'OPENING_BALANCE_EQUITY',
      'ACCOUNTS_RECEIVABLE',
      'ACCOUNTS_PAYABLE',
      'INVENTORY',
      'COGS',
      'UNDEPOSITED_FUNDS',
      'BAD_DEBT_EXPENSE',
      'TAX_PAYABLE',
      'TAX_RECEIVABLE',
      'WHT_PAYABLE',
      'WHT_RECEIVABLE',
      'GRIR',
      'SUPPLIER_RETURN_CLEARING'
    );

INSERT INTO schema_version (version) VALUES (558) ON CONFLICT DO NOTHING;
