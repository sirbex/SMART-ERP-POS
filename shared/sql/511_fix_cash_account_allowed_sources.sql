-- Migration 511: Add EXPENSE_PAYMENT and SUPPLIER_PAYMENT to Cash account AllowedSources
-- The Cash account (SystemAccountTag = 'CASH') must allow all sources that Rule D permits
-- to credit it: PAYMENT_DEPOSIT, SUPPLIER_PAYMENT, EXPENSE_PAYMENT, SALES_REFUND, SYSTEM_CORRECTION
UPDATE accounts
SET "AllowedSources" = ARRAY[
  'SALES_INVOICE',
  'PAYMENT_RECEIPT',
  'PAYMENT_DEPOSIT',
  'SUPPLIER_PAYMENT',
  'EXPENSE_PAYMENT',
  'SALES_REFUND',
  'SYSTEM_CORRECTION'
]::text[]
WHERE "SystemAccountTag" = 'CASH';
