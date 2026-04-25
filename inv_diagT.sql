-- Check available accounts for the corrective GL entry

-- 1. Find COGS and inventory-related accounts
SELECT "AccountCode", "AccountName", "AccountType", "CurrentBalance"
FROM accounts
WHERE "AccountCode" IN ('1300','5000','5100','5200','5900','6000','3900','3999','9999')
   OR "AccountName" ILIKE '%cogs%'
   OR "AccountName" ILIKE '%cost of goods%'
   OR "AccountName" ILIKE '%inventory%'
   OR "AccountName" ILIKE '%adjustment%'
   OR "AccountName" ILIKE '%variance%'
ORDER BY "AccountCode";

-- 2. Also check for retained earnings and equity accounts
SELECT "AccountCode", "AccountName", "AccountType", "CurrentBalance"
FROM accounts
WHERE "AccountType" IN ('EQUITY', 'EXPENSE')
ORDER BY "AccountCode";
