-- Migration 554: Restore SALES_INVOICE on POS liquidity accounts (1040 MoMo, etc.)
--
-- Account 1040 was created with AllowedSources = '{}' (empty = allow all in Rule B).
-- Treasury migrations 541/543 appended TREASURY_* to that empty array, producing a
-- non-empty restrictive list without SALES_INVOICE — blocking POS mobile money sales.
-- Migration 552 added EXPENSE_PAYMENT / SUPPLIER_PAYMENT but not sales receipt sources.
--
-- Fix: append POS + AR receipt sources to all customer-facing liquidity accounts.

UPDATE accounts
SET "AllowedSources" = (
  SELECT ARRAY(
    SELECT DISTINCT unnest(
      COALESCE("AllowedSources", ARRAY[]::text[])
      || ARRAY[
        'SALES_INVOICE',
        'PAYMENT_RECEIPT',
        'PAYMENT_DEPOSIT',
        'SALES_REFUND',
        'SYSTEM_CORRECTION'
      ]::text[]
    )
  )
)
WHERE "AccountCode" IN ('1010', '1012', '1020', '1030', '1040')
   OR "SystemAccountTag" IN ('CASH', 'PETTY_CASH', 'BANK', 'CARD_CLEARING', 'MOBILE_MONEY');

INSERT INTO schema_version (version) VALUES (554) ON CONFLICT DO NOTHING;
