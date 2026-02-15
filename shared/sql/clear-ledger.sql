-- Clear orphaned ledger data
DELETE FROM ledger_entries;
DELETE FROM ledger_transactions;

-- Verify
SELECT 'ledger_entries' as entity, COUNT(*) as count FROM ledger_entries
UNION ALL SELECT 'ledger_transactions', COUNT(*) FROM ledger_transactions;

-- Reset account balances again
UPDATE accounts SET "CurrentBalance" = 0 WHERE "CurrentBalance" != 0;

-- Verify accounts
SELECT 'accounts with non-zero balance' as check_type, COUNT(*) as count FROM accounts WHERE "CurrentBalance" != 0;
