SELECT COUNT(*) as grn_in_ap
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE lt."ReferenceType" = 'GOODS_RECEIPT'
AND a."AccountCode" = '2100'
AND le."CreditAmount" > 0;
