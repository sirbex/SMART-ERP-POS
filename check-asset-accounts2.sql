SELECT "AccountCode", "AccountName", "AllowedSources"
FROM accounts
WHERE "AccountCode" IN ('1010', '2100', '6500', '1550', '1500')
ORDER BY "AccountCode";
