-- ============================================================================
-- RECLASSIFY LEGACY PAYROLL GL ENTRIES
-- TXN-000027: DR 5000 -> DR 6000, CR 2100 -> CR 2150-002
-- TXN-000028: DR 5000 -> DR 6000, CR 2100 -> CR 2150-003
-- Then recalculate all affected account balances.
-- ============================================================================

BEGIN;

-- Reclassify TXN-000027: DEBIT entry 5000 -> 6000
UPDATE ledger_entries
SET "AccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '6000')
WHERE "TransactionId" = (SELECT "Id" FROM ledger_transactions WHERE "TransactionNumber" = 'TXN-000027')
  AND "EntryType" = 'DEBIT';

-- Reclassify TXN-000027: CREDIT entry 2100 -> 2150-002
UPDATE ledger_entries
SET "AccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '2150-002')
WHERE "TransactionId" = (SELECT "Id" FROM ledger_transactions WHERE "TransactionNumber" = 'TXN-000027')
  AND "EntryType" = 'CREDIT';

-- Reclassify TXN-000028: DEBIT entry 5000 -> 6000
UPDATE ledger_entries
SET "AccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '6000')
WHERE "TransactionId" = (SELECT "Id" FROM ledger_transactions WHERE "TransactionNumber" = 'TXN-000028')
  AND "EntryType" = 'DEBIT';

-- Reclassify TXN-000028: CREDIT entry 2100 -> 2150-003
UPDATE ledger_entries
SET "AccountId" = (SELECT "Id" FROM accounts WHERE "AccountCode" = '2150-003')
WHERE "TransactionId" = (SELECT "Id" FROM ledger_transactions WHERE "TransactionNumber" = 'TXN-000028')
  AND "EntryType" = 'CREDIT';

-- Also update the Description on the transactions to reflect correct account references
UPDATE ledger_transactions
SET "Description" = REPLACE("Description", 'Cost of Goods Sold', 'Salaries & Wages')
WHERE "TransactionNumber" IN ('TXN-000027', 'TXN-000028')
  AND "Description" LIKE '%Cost of Goods Sold%';

-- Recalculate ALL affected account balances (5000, 6000, 2100, 2150-002, 2150-003)
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
  WHERE a2."AccountCode" IN ('5000', '6000', '2100', '2150-002', '2150-003')
  GROUP BY a2."Id", a2."NormalBalance"
) sub
WHERE a."Id" = sub."Id";

-- Verify: show the reclassified entries
SELECT 'After reclassification:' AS info;
SELECT lt."TransactionNumber", le."EntryType", a."AccountCode", a."AccountName", le."Amount"
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE lt."TransactionNumber" IN ('TXN-000027', 'TXN-000028')
ORDER BY lt."TransactionNumber", le."EntryType";

-- Verify: show final balances of affected accounts
SELECT 'Final balances of affected accounts:' AS info;
SELECT a."AccountCode", a."AccountName", a."CurrentBalance"
FROM accounts a
WHERE a."AccountCode" IN ('5000', '6000', '2100', '2150-001', '2150-002', '2150-003')
ORDER BY a."AccountCode";

-- Final system-wide balance check
SELECT 'System-wide balance drift check (should be empty):' AS info;
SELECT a."AccountCode", a."AccountName",
       a."CurrentBalance" AS stored,
       CASE a."NormalBalance"
         WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
         WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
       END AS computed
FROM accounts a
LEFT JOIN ledger_entries le ON le."AccountId" = a."Id"
GROUP BY a."Id", a."AccountCode", a."AccountName", a."NormalBalance", a."CurrentBalance"
HAVING a."CurrentBalance" != CASE a."NormalBalance"
  WHEN 'DEBIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0)
  WHEN 'CREDIT' THEN COALESCE(SUM(CASE WHEN le."EntryType" = 'CREDIT' THEN le."Amount" ELSE 0 END), 0) - COALESCE(SUM(CASE WHEN le."EntryType" = 'DEBIT' THEN le."Amount" ELSE 0 END), 0)
END;

COMMIT;
