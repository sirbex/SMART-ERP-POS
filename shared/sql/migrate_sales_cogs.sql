-- ============================================================
-- MIGRATE EXISTING SALES TO TRACK COGS
-- ============================================================
-- Purpose: Update existing sales records to populate total_cost, 
--          profit, and profit_margin fields from sale_items data
-- Date: November 10, 2025
-- Status: Optional - only needed if historical sales exist
-- ============================================================

-- STEP 1: Check current state
-- How many sales have zero total_cost?
SELECT 
  COUNT(*) as total_sales,
  COUNT(CASE WHEN total_cost = 0 OR total_cost IS NULL THEN 1 END) as zero_cost_sales,
  COUNT(CASE WHEN total_cost > 0 THEN 1 END) as tracked_cost_sales
FROM sales;

-- STEP 2: Preview what will be updated
-- See the calculated values before applying
SELECT 
  s.id,
  s.sale_number,
  s.total_amount as current_total_amount,
  s.total_cost as current_total_cost,
  s.profit as current_profit,
  s.profit_margin as current_profit_margin,
  COALESCE(SUM(si.unit_cost * si.quantity), 0) as calculated_total_cost,
  s.total_amount - COALESCE(SUM(si.unit_cost * si.quantity), 0) as calculated_profit,
  CASE 
    WHEN s.total_amount > 0 THEN 
      (s.total_amount - COALESCE(SUM(si.unit_cost * si.quantity), 0)) / s.total_amount
    ELSE 0
  END as calculated_profit_margin
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id
WHERE s.total_cost = 0 OR s.total_cost IS NULL
GROUP BY s.id, s.sale_number, s.total_amount, s.total_cost, s.profit, s.profit_margin
ORDER BY s.created_at DESC
LIMIT 10;

-- STEP 3: Update existing sales with calculated COGS
-- WARNING: This will modify existing data. Review preview first!
-- Uncomment to run:

/*
BEGIN;

UPDATE sales s
SET 
  total_cost = (
    SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)
    FROM sale_items si
    WHERE si.sale_id = s.id
  ),
  profit = s.total_amount - (
    SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)
    FROM sale_items si
    WHERE si.sale_id = s.id
  ),
  profit_margin = CASE 
    WHEN s.total_amount > 0 THEN 
      (s.total_amount - (
        SELECT COALESCE(SUM(si.unit_cost * si.quantity), 0)
        FROM sale_items si
        WHERE si.sale_id = s.id
      )) / s.total_amount
    ELSE 0
  END
WHERE s.total_cost = 0 OR s.total_cost IS NULL;

-- Verify the update
SELECT 
  COUNT(*) as updated_sales,
  ROUND(AVG(total_cost)::numeric, 2) as avg_total_cost,
  ROUND(AVG(profit)::numeric, 2) as avg_profit,
  ROUND(AVG(profit_margin)::numeric, 4) as avg_profit_margin
FROM sales
WHERE total_cost > 0;

COMMIT;
*/

-- STEP 4: Verify the results
-- Check that all sales now have proper COGS tracking
SELECT 
  COUNT(*) as total_sales,
  COUNT(CASE WHEN total_cost = 0 THEN 1 END) as zero_cost_sales,
  COUNT(CASE WHEN total_cost > 0 THEN 1 END) as tracked_cost_sales,
  ROUND(AVG(CASE WHEN total_cost > 0 THEN profit_margin END)::numeric, 4) as avg_profit_margin_pct
FROM sales;

-- STEP 5: Sample verification
-- Show some sales with updated values
SELECT 
  sale_number,
  sale_date,
  total_amount,
  total_cost,
  profit,
  ROUND((profit_margin * 100)::numeric, 2) || '%' as profit_margin_pct,
  status
FROM sales
WHERE total_cost > 0
ORDER BY created_at DESC
LIMIT 20;

-- ============================================================
-- VALIDATION QUERIES
-- ============================================================

-- Check for data anomalies
SELECT 
  'Negative Profit' as issue_type,
  COUNT(*) as count
FROM sales
WHERE profit < 0 AND status = 'COMPLETED'

UNION ALL

SELECT 
  'Profit > Revenue' as issue_type,
  COUNT(*) as count
FROM sales
WHERE profit > total_amount AND status = 'COMPLETED'

UNION ALL

SELECT 
  'Margin > 100%' as issue_type,
  COUNT(*) as count
FROM sales
WHERE profit_margin > 1 AND status = 'COMPLETED'

UNION ALL

SELECT 
  'Zero Cost with Revenue' as issue_type,
  COUNT(*) as count
FROM sales
WHERE total_cost = 0 AND total_amount > 0 AND status = 'COMPLETED';

-- Check sale_items consistency
-- Ensure all sale_items have unit_cost populated
SELECT 
  COUNT(*) as total_items,
  COUNT(CASE WHEN unit_cost = 0 OR unit_cost IS NULL THEN 1 END) as zero_cost_items,
  COUNT(CASE WHEN unit_cost > 0 THEN 1 END) as tracked_cost_items
FROM sale_items;

-- List sales with items that have zero unit_cost
SELECT 
  s.sale_number,
  s.sale_date,
  p.name as product_name,
  si.quantity,
  si.unit_price,
  si.unit_cost,
  si.total_price
FROM sales s
JOIN sale_items si ON si.sale_id = s.id
JOIN products p ON p.id = si.product_id
WHERE si.unit_cost = 0 OR si.unit_cost IS NULL
ORDER BY s.created_at DESC
LIMIT 50;

-- ============================================================
-- NOTES
-- ============================================================
/*
IMPORTANT CONSIDERATIONS:

1. **Zero unit_cost in sale_items**:
   - If sale_items have zero unit_cost, the migration will result in zero total_cost
   - This is expected for products not received via Goods Receipt
   - These products may use average_cost from products table

2. **Negative Profit**:
   - Can occur if selling price < cost price (loss-making sales)
   - Review these manually to ensure they're legitimate

3. **Transaction Safety**:
   - The migration runs in a transaction (BEGIN/COMMIT)
   - If any issues occur, ROLLBACK is automatic
   - Test on a development/staging database first

4. **Performance**:
   - For large databases (>100k sales), consider batching
   - Add WHERE clause with date range: WHERE s.created_at >= '2025-01-01'

5. **Future Sales**:
   - New sales will automatically track COGS (code fix applied)
   - This migration only affects historical sales

6. **Backup Recommendation**:
   - Always backup the database before running migrations
   - pg_dump -U postgres -d pos_system -t sales -t sale_items > backup.sql
*/
