-- Sample existing GL entries to understand pattern
SELECT 
  lt."TransactionNumber",
  lt."ReferenceType",
  lt."ReferenceId",
  lt."Description",
  lt."Status",
  le."LineNumber",
  le."EntryType",
  le."Amount",
  le."DebitAmount",
  le."CreditAmount",
  le."EntityType"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."ReferenceType" = 'INVENTORY_ADJUSTMENT'
ORDER BY lt."CreatedAt" DESC
LIMIT 10;

-- Also look at any previous corrective/adjustment entries 
SELECT 
  lt."TransactionNumber",
  lt."ReferenceType",
  lt."ReferenceId",
  lt."Status",
  le."LineNumber",
  le."EntryType",
  le."Amount",
  le."DebitAmount",
  le."CreditAmount"
FROM ledger_transactions lt
JOIN ledger_entries le ON le."TransactionId" = lt."Id"
WHERE lt."ReferenceType" IN ('STOCK_MOVEMENT', 'ADJUSTMENT')
ORDER BY lt."CreatedAt" DESC
LIMIT 6;
