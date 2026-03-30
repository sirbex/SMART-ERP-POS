-- ============================================================================
-- FIX SELF-REFERENCING ACCOUNTS
-- 7 accounts have ParentAccountId = their own Id (circular reference)
-- Fix: point them to their correct parent header account or NULL
-- ============================================================================

BEGIN;

-- Show current state
SELECT '=== BEFORE FIX ===' AS info;
SELECT a."AccountCode", a."AccountName", a."Level",
       a."ParentAccountId",
       p."AccountCode" AS current_parent_code,
       CASE WHEN a."Id" = a."ParentAccountId" THEN 'SELF-REF!' ELSE 'ok' END AS status
FROM accounts a
LEFT JOIN accounts p ON p."Id" = a."ParentAccountId"
WHERE a."Id" = a."ParentAccountId"
ORDER BY a."AccountCode";

-- Fix: Set correct parents based on chart of accounts hierarchy
-- 1200 Accounts Receivable (Level 1) → parent should be 1000 Current Assets
UPDATE accounts SET "ParentAccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1000')
WHERE "AccountCode" = '1200' AND "Id" = "ParentAccountId";

-- 1300 Inventory (Level 1) → parent should be 1000 Current Assets
UPDATE accounts SET "ParentAccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '1000')
WHERE "AccountCode" = '1300' AND "Id" = "ParentAccountId";

-- 2100 Accounts Payable (Level 1) → parent should be 2000 Current Liabilities
UPDATE accounts SET "ParentAccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000')
WHERE "AccountCode" = '2100' AND "Id" = "ParentAccountId";

-- 2200 Customer Deposits (Level 1) → parent should be 2000 Current Liabilities
UPDATE accounts SET "ParentAccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '2000')
WHERE "AccountCode" = '2200' AND "Id" = "ParentAccountId";

-- 3100 Retained Earnings (Level 1) → parent should be 3000 Equity
UPDATE accounts SET "ParentAccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '3000')
WHERE "AccountCode" = '3100' AND "Id" = "ParentAccountId";

-- 4000 Sales Revenue (Level 1) → should be NULL (top-level revenue, no header above it)
-- Actually 4000 is level 1, there's no revenue header. Let's check if there should be one.
-- Looking at the chart: 4000 is a posting account at Level 1 with no header.
-- Other revenue accounts (4100, 4110, etc.) have no parent either.
-- Set to NULL to break the self-reference.
UPDATE accounts SET "ParentAccountId" = NULL
WHERE "AccountCode" = '4000' AND "Id" = "ParentAccountId";

-- 5000 Cost of Goods Sold (Level 1) → no expense header exists. Set to NULL.
UPDATE accounts SET "ParentAccountId" = NULL
WHERE "AccountCode" = '5000' AND "Id" = "ParentAccountId";

-- Verify
SELECT '=== AFTER FIX ===' AS info;
SELECT a."AccountCode", a."AccountName", a."Level",
       p."AccountCode" AS parent_code,
       p."AccountName" AS parent_name,
       CASE WHEN a."Id" = a."ParentAccountId" THEN 'SELF-REF!' ELSE 'ok' END AS status
FROM accounts a
LEFT JOIN accounts p ON p."Id" = a."ParentAccountId"
WHERE a."AccountCode" IN ('1200', '1300', '2100', '2200', '3100', '4000', '5000')
ORDER BY a."AccountCode";

-- Verify no remaining self-references
SELECT '=== REMAINING SELF-REFERENCES (should be 0) ===' AS info;
SELECT COUNT(*) AS self_ref_count FROM accounts WHERE "Id" = "ParentAccountId";

COMMIT;
