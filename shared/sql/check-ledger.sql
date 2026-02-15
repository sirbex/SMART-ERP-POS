-- Check ledger entries
SELECT "Id", "TransactionId", "AccountId", "Description", "DebitAmount", "CreditAmount", "CreatedAt" 
FROM ledger_entries 
ORDER BY "CreatedAt" DESC;

-- Check ledger transactions
SELECT "Id", "ReferenceNumber", "TransactionType", "Description", "TotalAmount", "CreatedAt"
FROM ledger_transactions
ORDER BY "CreatedAt" DESC;

-- Check goods receipts (these should be cleared)
SELECT id, gr_number, status, total_value, created_at FROM goods_receipts ORDER BY created_at DESC;

-- Check accounts balance
SELECT "Id", "AccountCode", "AccountName", "CurrentBalance" FROM accounts WHERE "CurrentBalance" != 0;
