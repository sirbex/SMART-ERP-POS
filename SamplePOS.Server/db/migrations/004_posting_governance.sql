-- =============================================================================
-- Migration 004: Posting Governance — Enterprise Accounting Controls
-- Comparable to SAP FI account master posting rules and Odoo account.account
-- constraints.
--
-- SAP analogy:
--   FS00 account master:  "Field Status Group" → allowed sources
--   OBA4 tolerance group: normal balance enforcement
--   FB01 posting block:   allowManualPosting = false
--
-- Odoo analogy:
--   account.account.deprecated → blocked from posting
--   account.journal.type       → source-controlled journals
--   account.account.tag        → system account identification
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Add governance columns to the accounts table
-- ---------------------------------------------------------------------------
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS "AllowManualPosting" BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "AllowedSources"     TEXT[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "SystemAccountTag"   TEXT             DEFAULT NULL;

-- Constraint: SystemAccountTag must be a known value when set
ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS chk_system_account_tag;

ALTER TABLE accounts
  ADD CONSTRAINT chk_system_account_tag CHECK (
    "SystemAccountTag" IS NULL OR "SystemAccountTag" IN (
      'CASH',
      'COGS',
      'INVENTORY',
      'OPENING_BALANCE_EQUITY',
      'UNDEPOSITED_FUNDS',
      'ACCOUNTS_RECEIVABLE',
      'ACCOUNTS_PAYABLE'
    )
  );

-- Only one account may carry each system tag (prevents OBE duplication)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_accounts_system_tag
  ON accounts ("SystemAccountTag")
  WHERE "SystemAccountTag" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Add source column to journal_entries so every entry carries its origin
-- ---------------------------------------------------------------------------
ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS "Source" TEXT NOT NULL DEFAULT 'MANUAL_JOURNAL';

ALTER TABLE journal_entries
  DROP CONSTRAINT IF EXISTS chk_journal_entry_source;

ALTER TABLE journal_entries
  ADD CONSTRAINT chk_journal_entry_source CHECK (
    "Source" IN (
      'SALES_INVOICE',
      'PAYMENT_RECEIPT',
      'PAYMENT_DEPOSIT',
      'PURCHASE_BILL',
      'INVENTORY_MOVE',
      'OPENING_BALANCE_WIZARD',
      'MANUAL_JOURNAL',
      'SYSTEM_CORRECTION',
      'PAYROLL',
      'ASSET_DEPRECIATION',
      'PERIOD_CLOSE',
      'FX_REVALUATION'
    )
  );

-- Also stamp the referenceType field in ledger_transactions with a source
-- (ledger_transactions.ReferenceType already holds module context, this is
-- an additive non-breaking extension)
ALTER TABLE ledger_transactions
  ADD COLUMN IF NOT EXISTS "PostingSource" TEXT DEFAULT NULL;

-- ---------------------------------------------------------------------------
-- 3. Tag existing system accounts with governance rules
--    Based on the known chart of accounts codes in AccountCodes constants.
-- ---------------------------------------------------------------------------

-- 1010 Cash — debit-normal, no manual posting, only PAYMENT_DEPOSIT may credit it
UPDATE accounts SET
  "SystemAccountTag"   = 'CASH',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1010' AND "IsActive" = TRUE;

-- 1020 Credit Card Receipts — treated as a cash-equivalent clearing account
UPDATE accounts SET
  "SystemAccountTag"   = 'CASH',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1020' AND "IsActive" = TRUE;

-- 1030 Checking Account — bank account, deposit-only
UPDATE accounts SET
  "SystemAccountTag"   = 'CASH',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1030' AND "IsActive" = TRUE;

-- 1040 Mobile Money — cash equivalent
UPDATE accounts SET
  "SystemAccountTag"   = 'CASH',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1040' AND "IsActive" = TRUE;

-- 1200 Accounts Receivable — system-controlled
UPDATE accounts SET
  "SystemAccountTag"   = 'ACCOUNTS_RECEIVABLE',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['SALES_INVOICE', 'PAYMENT_RECEIPT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1200' AND "IsActive" = TRUE;

-- 1300 Inventory — only inventory module may post
UPDATE accounts SET
  "SystemAccountTag"   = 'INVENTORY',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['INVENTORY_MOVE', 'PURCHASE_BILL', 'SALES_INVOICE', 'OPENING_BALANCE_WIZARD', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '1300' AND "IsActive" = TRUE;

-- 2100 Accounts Payable — system-controlled
UPDATE accounts SET
  "SystemAccountTag"   = 'ACCOUNTS_PAYABLE',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PURCHASE_BILL', 'PAYMENT_RECEIPT', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '2100' AND "IsActive" = TRUE;

-- 3050 Opening Balance Equity — wizard only, no duplicates
UPDATE accounts SET
  "SystemAccountTag"   = 'OPENING_BALANCE_EQUITY',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['OPENING_BALANCE_WIZARD', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '3050' AND "IsActive" = TRUE;

-- 5000 COGS — inventory module only
UPDATE accounts SET
  "SystemAccountTag"   = 'COGS',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['INVENTORY_MOVE', 'SALES_INVOICE', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '5000' AND "IsActive" = TRUE;

-- ---------------------------------------------------------------------------
-- 4. Detect and rename duplicate "Opening Balance Equity" accounts
--    (the analysis found 3050 and 3200 both named "Opening Balance Equity")
--    Keep 3050 as the canonical OBE. Rename 3200 to "Retained Earnings".
-- ---------------------------------------------------------------------------
UPDATE accounts SET
  "AccountName"        = 'Retained Earnings',
  "AllowManualPosting" = FALSE,
  "AllowedSources"     = ARRAY['PERIOD_CLOSE', 'SYSTEM_CORRECTION']
WHERE "AccountCode" = '3200'
  AND "AccountName" = 'Opening Balance Equity';

-- ---------------------------------------------------------------------------
-- 5. Add Undeposited Funds clearing account if it does not exist
--    (SAP: "Cash in Transit" / Odoo: "Outstanding receipts" account)
-- ---------------------------------------------------------------------------
INSERT INTO accounts (
  "Id", "AccountCode", "AccountName", "AccountType", "NormalBalance",
  "IsPostingAccount", "IsActive", "SystemAccountTag",
  "AllowManualPosting", "AllowedSources",
  "CurrentBalance", "Level", "Description", "CreatedAt", "UpdatedAt"
)
SELECT
  gen_random_uuid(), '1015', 'Undeposited Funds', 'ASSET', 'DEBIT',
  TRUE, TRUE, 'UNDEPOSITED_FUNDS',
  FALSE, ARRAY['PAYMENT_RECEIPT', 'PAYMENT_DEPOSIT', 'SYSTEM_CORRECTION'],
  0, 1, 'Clearing account: holds payments received before bank deposit',
  NOW(), NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM accounts WHERE "AccountCode" = '1015'
);

-- ---------------------------------------------------------------------------
-- 6. Set NormalBalance for all existing accounts where it may be wrong
--    (Assets/Expenses → DEBIT; Liabilities/Equity/Revenue → CREDIT)
-- ---------------------------------------------------------------------------
UPDATE accounts SET "NormalBalance" = 'DEBIT'
WHERE "AccountType" IN ('ASSET', 'EXPENSE')
  AND ("NormalBalance" IS NULL OR "NormalBalance" != 'DEBIT');

UPDATE accounts SET "NormalBalance" = 'CREDIT'
WHERE "AccountType" IN ('LIABILITY', 'EQUITY', 'REVENUE')
  AND ("NormalBalance" IS NULL OR "NormalBalance" != 'CREDIT');

-- ---------------------------------------------------------------------------
-- 7. Record migration in schema_version
-- ---------------------------------------------------------------------------
INSERT INTO schema_version (version, description, applied_at)
VALUES (4, '004_posting_governance: enterprise account controls, undeposited funds, source enforcement', NOW())
ON CONFLICT (version) DO NOTHING;

COMMIT;
