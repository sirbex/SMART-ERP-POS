-- Migration 019: Add posting governance columns to accounts table
--
-- PROBLEM:
--   Production DB has three governance columns on the accounts table that
--   were added directly without a migration file:
--     - AllowManualPosting  BOOLEAN NOT NULL DEFAULT TRUE
--     - AllowedSources      TEXT[]  NOT NULL DEFAULT '{}'
--     - SystemAccountTag    TEXT    NULL
--
--   These columns are queried by PostingGovernanceService.fetchGovernanceAccounts().
--   Without them, the governance SELECT aborts the PostgreSQL transaction, causing
--   every subsequent query on that client to return 0 rows. This made the per-line
--   account lookup fail with "Account not found: 1020" (and other codes) for any
--   payment method other than the one that happened to succeed before the error.
--
-- FIX:
--   Add the three columns with correct types, defaults, and governance values
--   matching production exactly.

BEGIN;

-- 1. Add columns (idempotent)
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS "AllowManualPosting" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "AllowedSources"     TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "SystemAccountTag"   TEXT    NULL;

-- 2. Set system account tags (these match production exactly)
UPDATE accounts SET "SystemAccountTag" = 'CASH'
  WHERE "AccountCode" = '1010' AND "SystemAccountTag" IS NULL;

UPDATE accounts SET "SystemAccountTag" = 'UNDEPOSITED_FUNDS'
  WHERE "AccountCode" = '1015' AND "SystemAccountTag" IS NULL;

UPDATE accounts SET "SystemAccountTag" = 'ACCOUNTS_RECEIVABLE'
  WHERE "AccountCode" = '1200' AND "SystemAccountTag" IS NULL;

UPDATE accounts SET "SystemAccountTag" = 'INVENTORY'
  WHERE "AccountCode" = '1300' AND "SystemAccountTag" IS NULL;

UPDATE accounts SET "SystemAccountTag" = 'ACCOUNTS_PAYABLE'
  WHERE "AccountCode" = '2100' AND "SystemAccountTag" IS NULL;

UPDATE accounts SET "SystemAccountTag" = 'OPENING_BALANCE_EQUITY'
  WHERE "AccountCode" = '3050' AND "SystemAccountTag" IS NULL;

UPDATE accounts SET "SystemAccountTag" = 'COGS'
  WHERE "AccountCode" = '5000' AND "SystemAccountTag" IS NULL;

-- 3. Set AllowManualPosting = false for system-controlled accounts
UPDATE accounts SET "AllowManualPosting" = FALSE
  WHERE "AccountCode" IN ('1010','1015','1200','1300','2100','3050','5000');

-- 4. Set AllowedSources for restricted accounts (matches production exactly)
UPDATE accounts SET "AllowedSources" = ARRAY['SALES_INVOICE','PAYMENT_RECEIPT','PAYMENT_DEPOSIT','SYSTEM_CORRECTION']
  WHERE "AccountCode" = '1010';  -- Cash

UPDATE accounts SET "AllowedSources" = ARRAY['PAYMENT_RECEIPT','PAYMENT_DEPOSIT','SYSTEM_CORRECTION']
  WHERE "AccountCode" = '1015';  -- Undeposited Funds

UPDATE accounts SET "AllowedSources" = ARRAY['SALES_INVOICE','PAYMENT_RECEIPT','SYSTEM_CORRECTION']
  WHERE "AccountCode" = '1200';  -- Accounts Receivable

UPDATE accounts SET "AllowedSources" = ARRAY['INVENTORY_MOVE','SYSTEM_CORRECTION','OPENING_BALANCE_WIZARD']
  WHERE "AccountCode" = '1300';  -- Inventory

UPDATE accounts SET "AllowedSources" = ARRAY['PURCHASE_BILL','PAYMENT_RECEIPT','INVENTORY_MOVE','SYSTEM_CORRECTION']
  WHERE "AccountCode" = '2100';  -- Accounts Payable

UPDATE accounts SET "AllowedSources" = ARRAY['OPENING_BALANCE_WIZARD','SYSTEM_CORRECTION']
  WHERE "AccountCode" = '3050';  -- Opening Balance Equity

UPDATE accounts SET "AllowedSources" = ARRAY['INVENTORY_MOVE','SALES_INVOICE','SYSTEM_CORRECTION']
  WHERE "AccountCode" = '5000';  -- Cost of Goods Sold

-- Record migration
INSERT INTO schema_version (version, applied_at)
SELECT 19, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 19);

COMMIT;
