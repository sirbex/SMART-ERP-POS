-- Complete account analysis
\pset pager off

-- All accounts
SELECT "AccountCode", "AccountName", "NormalBalance", "CurrentBalance"::numeric(15,2) as balance
FROM accounts 
WHERE "IsActive" = true 
ORDER BY "AccountCode";

-- Trial Balance
SELECT 
    SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_debits,
    SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END)::numeric(15,2) as total_credits,
    (SUM(CASE WHEN "NormalBalance" = 'DEBIT' THEN "CurrentBalance" ELSE 0 END) -
     SUM(CASE WHEN "NormalBalance" = 'CREDIT' THEN "CurrentBalance" ELSE 0 END))::numeric(15,2) as difference
FROM accounts WHERE "IsActive" = true;

-- Source data
SELECT 'Customer Balances (AR source)' as item, COALESCE(SUM(balance), 0)::numeric(15,2) as value FROM customers WHERE is_active = true;
SELECT 'Supplier Balances (AP source)' as item, COALESCE(SUM("OutstandingBalance"), 0)::numeric(15,2) as value FROM suppliers WHERE "IsActive" = true;
SELECT 'Completed Sales Revenue' as item, COALESCE(SUM(total_amount), 0)::numeric(15,2) as value FROM sales WHERE status = 'COMPLETED';
SELECT 'Completed Sales COGS' as item, COALESCE(SUM(total_cost), 0)::numeric(15,2) as value FROM sales WHERE status = 'COMPLETED';
SELECT 'Active Deposits' as item, COALESCE(SUM(amount_available), 0)::numeric(15,2) as value FROM pos_customer_deposits WHERE status = 'ACTIVE';
SELECT 'Inventory Value' as item, COALESCE(SUM(remaining_quantity * cost_price), 0)::numeric(15,2) as value FROM inventory_batches WHERE remaining_quantity > 0;
