-- ============================================================================
-- Migration 516: Add CashFlowClass column to accounts table
-- ============================================================================
-- Required by IAS 7 Cash Flow Statement (cashFlowService.ts).
-- The cash flow engine classifies GL movements by reading "CashFlowClass"
-- from the OPPOSITE account in each journal entry touching Cash/Bank.
--
-- Rules:
--   NULL          → Cash/Bank accounts (1010,1015,1020,1030,1040).
--                   These ARE the subject of cash flow; they don't classify it.
--   'operating'   → Revenue, Expenses, AR, AP, Inventory, Tax, Deposits.
--   'investing'   → Fixed Assets, Accumulated Depreciation.
--   'financing'   → Equity, Owner Capital, Retained Earnings, Loans.
-- ============================================================================

BEGIN;

-- 1. Add column (idempotent)
ALTER TABLE accounts
    ADD COLUMN IF NOT EXISTS "CashFlowClass" TEXT
        CHECK ("CashFlowClass" IN ('operating', 'investing', 'financing'));

-- 2. Classify all accounts
UPDATE accounts
SET "CashFlowClass" = CASE
    -- Cash / Bank accounts → NULL (they ARE the cash; never the classifier)
    WHEN "AccountCode" IN ('1010', '1015', '1020', '1030', '1040') THEN NULL

    -- Investing activities: Fixed Assets and Accumulated Depreciation
    WHEN "AccountCode" IN ('1500', '1550') THEN 'investing'

    -- Financing activities: all Equity accounts
    WHEN "AccountType" = 'EQUITY' THEN 'financing'

    -- Operating activities: everything else
    --   (AR, AP, Inventory, Tax, Customer Deposits, Revenue, Expenses)
    ELSE 'operating'
END;

-- 3. Bump schema version
INSERT INTO schema_version (version) VALUES (515);

COMMIT;
