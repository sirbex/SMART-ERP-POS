-- Fix GL entries for SALE-2025-0001 / INV-2025-0001
-- Correct amounts: 165,200 (not 189,736)

-- Fix invoice GL entry (AR Debit)
UPDATE ledger_entries 
SET "Amount" = 165200.00, "DebitAmount" = 165200.00
WHERE "TransactionId" IN (
  SELECT "Id" FROM ledger_transactions WHERE "ReferenceNumber" = 'INV-2025-0001'
) AND "DebitAmount" = 189736.00;

-- Fix invoice GL entry (Revenue Credit)
UPDATE ledger_entries 
SET "Amount" = 165200.00, "CreditAmount" = 165200.00
WHERE "TransactionId" IN (
  SELECT "Id" FROM ledger_transactions WHERE "ReferenceNumber" = 'INV-2025-0001'
) AND "CreditAmount" = 189736.00;

-- Fix payment GL entry (Cash Debit)
UPDATE ledger_entries 
SET "Amount" = 165200.00, "DebitAmount" = 165200.00
WHERE "TransactionId" IN (
  SELECT "Id" FROM ledger_transactions WHERE "ReferenceNumber" = 'RCPT-2025-0001'
) AND "DebitAmount" = 189736.00;

-- Fix payment GL entry (AR Credit)
UPDATE ledger_entries 
SET "Amount" = 165200.00, "CreditAmount" = 165200.00
WHERE "TransactionId" IN (
  SELECT "Id" FROM ledger_transactions WHERE "ReferenceNumber" = 'RCPT-2025-0001'
) AND "CreditAmount" = 189736.00;

-- Update ledger_transactions totals
UPDATE ledger_transactions
SET "TotalDebitAmount" = 165200.00, "TotalCreditAmount" = 165200.00
WHERE "ReferenceNumber" IN ('INV-2025-0001', 'RCPT-2025-0001');

-- Verify the fix
SELECT lt."ReferenceNumber", a."AccountCode", a."AccountName", 
       le."DebitAmount"::numeric(12,2) as debit, 
       le."CreditAmount"::numeric(12,2) as credit 
FROM ledger_transactions lt 
JOIN ledger_entries le ON le."TransactionId" = lt."Id" 
JOIN accounts a ON a."Id" = le."AccountId" 
WHERE lt."ReferenceNumber" IN ('INV-2025-0001', 'RCPT-2025-0001', 'SALE-2025-0001')
ORDER BY lt."CreatedAt", a."AccountCode";
