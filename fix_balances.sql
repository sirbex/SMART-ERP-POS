-- ============================================================================
-- BALANCE RECONCILIATION SCRIPT
-- Recalculates ALL account CurrentBalance from ledger_entries (source of truth)
-- ============================================================================

-- Step 1: Show drifted accounts BEFORE fix
SELECT 'BEFORE FIX - Drifted accounts:' AS info;

SELECT a."AccountCode", a."AccountName", a."NormalBalance",
       a."CurrentBalance" AS stored_balance,
       CASE a."NormalBalance"
         WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
         WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
       END AS computed_balance
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."NormalBalance", a."CurrentBalance"
HAVING a."CurrentBalance" != CASE a."NormalBalance"
  WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
  WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
END
ORDER BY a."AccountCode";

-- Step 2: Recalculate ALL account balances from ledger entries
UPDATE accounts a
SET "CurrentBalance" = sub.computed_balance,
    "UpdatedAt" = NOW()
FROM (
  SELECT a2."Id",
    CASE a2."NormalBalance"
      WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
      WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
    END AS computed_balance
  FROM accounts a2
  LEFT JOIN ledger_entries le ON le."AccountId" = a2."Id"
  GROUP BY a2."Id", a2."NormalBalance"
) sub
WHERE a."Id" = sub."Id"
  AND a."CurrentBalance" != sub.computed_balance;

-- Step 3: Verify - should return 0 rows
SELECT 'AFTER FIX - Remaining drift (should be empty):' AS info;

SELECT a."AccountCode", a."AccountName",
       a."CurrentBalance" AS stored_balance,
       CASE a."NormalBalance"
         WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
         WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
       END AS computed_balance
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."NormalBalance", a."CurrentBalance"
HAVING a."CurrentBalance" != CASE a."NormalBalance"
  WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
  WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
END
ORDER BY a."AccountCode";
