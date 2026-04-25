-- Compare COGS GL (credits to 1300) vs actual cost of items sold from batch records
-- If GL COGS > batch-derived COGS, that explains why GL balance is lower than batch remaining

-- 1. Total COGS from GL (all credits to account 1300)
SELECT 
  lt."ReferenceType",
  COUNT(DISTINCT lt."Id") AS txn_count,
  ROUND(SUM(le."CreditAmount"), 2) AS total_cogs_credit
FROM ledger_entries le
JOIN ledger_transactions lt ON lt."Id" = le."TransactionId"
JOIN accounts a ON a."Id" = le."AccountId"
WHERE a."AccountCode" = '1300'
  AND le."CreditAmount" > 0
GROUP BY lt."ReferenceType";

-- 2. Actual cost of items sold from sale_items (what cost was actually deducted from batches)
SELECT 
  ROUND(SUM(si.cost_price * si.quantity), 2) AS sale_items_total_cost,
  COUNT(*) AS line_count
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.status = 'COMPLETED';

-- 3. Check if cost_price in sale_items matches the batch cost_price at time of sale
-- (sample a few recent sales to see if cost_of_goods matches batch cost)
SELECT 
  s.sale_number,
  s.sale_date,
  p.name AS product_name,
  si.quantity,
  si.cost_price AS item_cost_price,
  si.cost_of_goods,
  ROUND(si.quantity * si.cost_price, 2) AS computed_cogs
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN products p ON p.id = si.product_id
WHERE s.status = 'COMPLETED'
  AND ABS(COALESCE(si.cost_of_goods, 0) - ROUND(si.quantity * si.cost_price, 2)) > 1
ORDER BY s.sale_date DESC
LIMIT 20;

-- 4. Total COGS from sale_items (using cost_of_goods if available)
SELECT 
  ROUND(SUM(COALESCE(si.cost_of_goods, si.quantity * si.cost_price)), 2) AS cogs_from_sale_items,
  ROUND(SUM(si.quantity * si.cost_price), 2) AS cogs_computed
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.status = 'COMPLETED';
