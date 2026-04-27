SELECT "AccountCode", "AccountName", "AllowedSources"
FROM accounts
WHERE "AccountCode" IN ('4200', '6900')
ORDER BY "AccountCode";
