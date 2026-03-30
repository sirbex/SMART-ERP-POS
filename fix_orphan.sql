-- ============================================================================
-- FIX ORPHAN TXN-000029
-- This transaction was created by a failed posting attempt (AccountingCore
-- committed internally even though the outer transaction failed).
-- No payroll_entry references it. Safe to remove + rebalance.
-- ============================================================================

BEGIN;

-- Verify it's truly orphaned
SELECT 'Verifying TXN-000029 is orphaned:' AS info;
SELECT lt."TransactionNumber",
       COUNT(pe."Id") AS payroll_refs
FROM ledger_transactions lt
LEFT JOIN payroll_entries pe ON pe."JournalEntryId" = lt."Id"
WHERE lt."TransactionNumber" = 'TXN-000029'
GROUP BY lt."TransactionNumber";

-- Delete ledger entries first (FK constraint)
DELETE FROM ledger_entries
WHERE "TransactionId" = (
  SELECT "Id" FROM ledger_transactions WHERE "TransactionNumber" = 'TXN-000029'
);

-- Delete the orphan transaction
DELETE FROM ledger_transactions
WHERE "TransactionNumber" = 'TXN-000029';

-- Recalculate balances for affected accounts (6000 and 2150-001)
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
  WHERE a2."AccountCode" IN ('6000', '2150-001')
  GROUP BY a2."Id", a2."NormalBalance"
) sub
WHERE a."Id" = sub."Id";

-- Verify final state
SELECT 'After orphan removal - affected accounts:' AS info;
SELECT a."AccountCode", a."AccountName", a."CurrentBalance"
FROM accounts a
WHERE a."AccountCode" IN ('6000', '2150-001');

COMMIT;
