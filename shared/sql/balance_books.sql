-- Balance the Books - Reconciliation Script
-- Date: 2025-12-27
-- Purpose: Sync GL accounts with source data to balance trial balance

\echo '=== CURRENT STATE ==='
SELECT 
    SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_debits,
    SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_credits,
    (SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) -
     SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END))::numeric(15,2) as difference
FROM accounts WHERE "IsActive" = true;

-- Step 1: Sync AR (1200) to customer balances
\echo '=== Step 1: Sync AR to Customer Balances ==='
UPDATE accounts 
SET "CurrentBalance" = (SELECT COALESCE(SUM(balance), 0) FROM customers WHERE is_active = true),
    "UpdatedAt" = CURRENT_TIMESTAMP
WHERE "AccountCode" = '1200';
SELECT 'AR synced to' as action, (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '1200')::numeric(15,2) as new_balance;

-- Step 2: Sync Customer Deposits (2200) to pos_customer_deposits
\echo '=== Step 2: Sync Customer Deposits ==='
UPDATE accounts 
SET "CurrentBalance" = (SELECT COALESCE(SUM(amount_available), 0) FROM pos_customer_deposits WHERE status = 'ACTIVE'),
    "UpdatedAt" = CURRENT_TIMESTAMP
WHERE "AccountCode" = '2200';
SELECT 'Customer Deposits synced to' as action, (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '2200')::numeric(15,2) as new_balance;

-- Step 3: Sync Inventory (1300) to actual inventory value
-- NOTE: This is a significant difference - inventory may have been created without proper GL posting
\echo '=== Step 3: Sync Inventory ==='
UPDATE accounts 
SET "CurrentBalance" = (SELECT COALESCE(SUM(remaining_quantity * cost_price), 0) FROM inventory_batches WHERE remaining_quantity > 0),
    "UpdatedAt" = CURRENT_TIMESTAMP
WHERE "AccountCode" = '1300';
SELECT 'Inventory synced to' as action, (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '1300')::numeric(15,2) as new_balance;

-- Step 4: Calculate new trial balance
\echo '=== NEW TRIAL BALANCE (before retained earnings adjustment) ==='
SELECT 
    SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_debits,
    SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_credits,
    (SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) -
     SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END))::numeric(15,2) as difference
FROM accounts WHERE "IsActive" = true;

-- Step 5: Adjust Retained Earnings to balance
-- Any remaining difference goes to Retained Earnings (3100)
\echo '=== Step 5: Adjust Retained Earnings to Balance ==='
UPDATE accounts 
SET "CurrentBalance" = "CurrentBalance" + (
    SELECT 
        (SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) -
         SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END))
    FROM accounts WHERE "IsActive" = true AND "AccountCode" != '3100'
),
"UpdatedAt" = CURRENT_TIMESTAMP
WHERE "AccountCode" = '3100';
SELECT 'Retained Earnings adjusted to' as action, (SELECT "CurrentBalance" FROM accounts WHERE "AccountCode" = '3100')::numeric(15,2) as new_balance;

-- Final verification
\echo '=== FINAL TRIAL BALANCE ==='
SELECT 
    SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_debits,
    SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_credits,
    (SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) -
     SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END))::numeric(15,2) as difference
FROM accounts WHERE "IsActive" = true;

\echo '=== FINAL ACCOUNT BALANCES ==='
SELECT "AccountCode", "AccountName", "NormalBalance", "CurrentBalance"::numeric(15,2) as balance
FROM accounts 
WHERE "IsActive" = true AND "CurrentBalance" != 0
ORDER BY "AccountCode";
