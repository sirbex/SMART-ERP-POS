-- =====================================================================
-- SAP Missing Accounts & Account Code Conflict Resolution
-- Date: 2026-04-10
-- 1. Add Price Variance, Depreciation Expense, General Expense accounts
-- 2. Relocate Salaries Payable from 2150 → 2400 (2150 = GR/IR Clearing)
-- =====================================================================

BEGIN;

-- =====================================================================
-- PART 1: Resolve 2150 conflict — Salaries Payable → 2400
-- HR module was using 2150 for Salaries Payable, but SAP standard
-- reserves 2150 for GR/IR Clearing. Move HR to 2400.
-- =====================================================================

-- Create new Salaries Payable header at 2400
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '2400', 'Salaries Payable', 'LIABILITY', 'CREDIT', true,
       (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000'),
       'Salaries payable header account (parent for employee sub-accounts)', 1, false, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '2400');

-- Move employee sub-accounts from 2150-xxx to 2400-xxx
UPDATE accounts
SET "AccountCode" = REPLACE("AccountCode", '2150-', '2400-'),
    "ParentAccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '2400')
WHERE "AccountCode" LIKE '2150-%';

-- Rename 2150 from "Salaries Payable" to "GR/IR Clearing"
UPDATE accounts
SET "AccountName" = 'GR/IR Clearing',
    "Description" = 'Goods Receipt / Invoice Receipt clearing account for 3-way matching (SAP equivalent)',
    "IsPostingAccount" = true
WHERE "AccountCode" = '2150';

-- =====================================================================
-- PART 2: Add missing SAP accounts
-- =====================================================================

-- Price Variance (5020) — posted when GR/IR invoice differs from GR amount
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '5020', 'Purchase Price Variance', 'EXPENSE', 'DEBIT', true, NULL,
       'Price variance between goods receipt and supplier invoice (SAP 393000)', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '5020');

-- Depreciation Expense (6500) — posted by monthly depreciation run
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '6500', 'Depreciation Expense', 'EXPENSE', 'DEBIT', true, NULL,
       'Depreciation expense for fixed assets (SAP 650000)', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6500');

-- Loss on Disposal / General Expense (6900)
INSERT INTO accounts ("Id", "AccountCode", "AccountName", "AccountType", "NormalBalance", "IsActive", "ParentAccountId", "Description", "Level", "IsPostingAccount", "CurrentBalance", "CreatedAt", "UpdatedAt")
SELECT gen_random_uuid(), '6900', 'General Expense / Loss on Disposal', 'EXPENSE', 'DEBIT', true, NULL,
       'General expense and loss on asset disposal (SAP 890000)', 1, true, 0, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE "AccountCode" = '6900');

COMMIT;
