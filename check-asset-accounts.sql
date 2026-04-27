SELECT "AccountCode", "AccountName", "AllowedSources"
FROM accounts
WHERE "AccountCode" IN ('1500', '1550', '6500', '1000', '2000')
ORDER BY "AccountCode";
