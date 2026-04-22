SELECT 
  lt."ReferenceType",
  ROUND(SUM(le."DebitAmount"),0) AS total_dr,
  ROUND(SUM(le."CreditAmount"),0) AS total_cr,
  COUNT(*) AS entry_count
FROM ledger_entries le
JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
JOIN accounts a ON le."AccountId" = a."Id"
WHERE a."AccountCode" = '1010'
GROUP BY lt."ReferenceType"
ORDER BY (SUM(le."DebitAmount") + SUM(le."CreditAmount")) DESC;
