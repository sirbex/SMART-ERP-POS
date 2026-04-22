SELECT "AccountCode", "AccountName", "AccountType", "NormalBalance", "CurrentBalance"
FROM accounts
WHERE "AccountType" IN ('EQUITY', 'LIABILITY')
ORDER BY "AccountCode";
