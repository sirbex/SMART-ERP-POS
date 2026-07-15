-- Migration 552: Allow EXPENSE_PAYMENT on real cash-out liquidity accounts
--
-- Expense mark-paid posts: Dr AP (2100) / Cr Cash|Bank|MoMo|Petty with source EXPENSE_PAYMENT.
-- Migration 511 only tagged CASH. Treasury 543 rewrote AllowedSources for liquidity codes
-- without preserving EXPENSE_PAYMENT on BANK (1030) / MOBILE_MONEY (1040) / PETTY_CASH.
-- UNDEPOSITED_FUNDS (1015) and CARD_CLEARING (1020) must NOT accept EXPENSE_PAYMENT.

UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY['EXPENSE_PAYMENT', 'SUPPLIER_PAYMENT']::text[]
    )
  )
)
WHERE "SystemAccountTag" IN ('CASH', 'BANK', 'MOBILE_MONEY', 'PETTY_CASH')
   OR "AccountCode" IN ('1010', '1012', '1030', '1040');

INSERT INTO schema_version (version) VALUES (552) ON CONFLICT DO NOTHING;
