-- 601: HR payroll / advance cash governance SSOT
-- 1) Strip PAYROLL from till (1010) and undeposited (1015) — Rule D forbids PAYROLL CR cash
-- 2) Keep/grant PAYROLL on petty cash, bank, MoMo, employee subledgers, expense
-- 3) Grant CASH_VARIANCE on 1010 + 1410* for till shortage → employee receivable

-- Strip illegal PAYROLL grant on till / undeposited / CASH tag
UPDATE accounts
SET "AllowedSources" = array_remove(COALESCE("AllowedSources", ARRAY[]::text[]), 'PAYROLL'),
    "UpdatedAt" = NOW()
WHERE (
    "AccountCode" IN ('1010', '1015')
    OR COALESCE("SystemAccountTag", '') IN ('CASH', 'UNDEPOSITED_FUNDS')
  )
  AND 'PAYROLL' = ANY(COALESCE("AllowedSources", ARRAY[]::text[]));

-- Ensure PAYROLL on legitimate payroll liquidity + subledgers + expense
UPDATE accounts
SET "AllowedSources" = array_append(COALESCE("AllowedSources", ARRAY[]::text[]), 'PAYROLL'),
    "UpdatedAt" = NOW()
WHERE (
    "AccountCode" IN ('1012', '1020', '1030', '1040', '6000')
    OR COALESCE("SystemAccountTag", '') IN ('BANK', 'MOBILE_MONEY', 'PETTY_CASH')
    OR "AccountCode" = '1410'
    OR "AccountCode" LIKE '1410-%'
    OR "AccountCode" = '2400'
    OR "AccountCode" LIKE '2400-%'
  )
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('PAYROLL' = ANY(COALESCE("AllowedSources", ARRAY[]::text[])));

-- Grant CASH_VARIANCE on cash drawer + employee advances (+ shortage expense for reclass)
UPDATE accounts
SET "AllowedSources" = array_append(COALESCE("AllowedSources", ARRAY[]::text[]), 'CASH_VARIANCE'),
    "UpdatedAt" = NOW()
WHERE (
    "AccountCode" IN ('1010', '6850')
    OR COALESCE("SystemAccountTag", '') = 'CASH'
    OR "AccountCode" = '1410'
    OR "AccountCode" LIKE '1410-%'
  )
  AND COALESCE(array_length("AllowedSources", 1), 0) > 0
  AND NOT ('CASH_VARIANCE' = ANY(COALESCE("AllowedSources", ARRAY[]::text[])));

INSERT INTO schema_version (version) VALUES (601) ON CONFLICT DO NOTHING;
