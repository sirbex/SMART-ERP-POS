-- Migration 512: Add EXPENSE_PAYMENT to Accounts Payable AllowedSources
-- When marking an expense as paid, the journal entry does DR AP / CR Cash
-- Both accounts must allow the EXPENSE_PAYMENT source (Rule B check)
UPDATE accounts
SET "AllowedSources" = ARRAY[
  'PURCHASE_BILL', 'PAYMENT_RECEIPT', 'INVENTORY_MOVE',
  'SUPPLIER_PAYMENT', 'EXPENSE_PAYMENT', 'SYSTEM_CORRECTION'
]::text[]
WHERE "AccountName" ILIKE '%accounts payable%'
   OR "SystemAccountTag" IN ('AP', 'ACCOUNTS_PAYABLE', 'PAYABLE');
