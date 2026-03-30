-- ============================================================================
-- DEEP DIVE: SALES DISCREPANCIES & SCHEMA DISCOVERY
-- ============================================================================

-- 1. Sales column names
SELECT '=== SALES TABLE COLUMNS ===' AS section;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sales' ORDER BY ordinal_position;

-- 2. Products column names
SELECT '=== PRODUCTS TABLE COLUMNS ===' AS section;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'products' ORDER BY ordinal_position;

-- 3. Customer-related tables
SELECT '=== CUSTOMER-RELATED TABLES ===' AS section;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE '%customer%'
ORDER BY table_name;

-- 4. Deep dive into the 5 sales with discrepancies
SELECT '=== SALE DISCREPANCY DETAIL ===' AS section;
SELECT s.id, s.sale_number, s.total_amount, s.discount_amount, s.tax_amount,
       items.computed_subtotal,
       s.total_amount - items.computed_subtotal AS diff,
       items.item_count
FROM sales s
JOIN (
  SELECT sale_id,
         SUM(quantity * unit_price) AS computed_subtotal,
         COUNT(*) AS item_count
  FROM sale_items
  GROUP BY sale_id
) items ON items.sale_id = s.id
WHERE s.total_amount != items.computed_subtotal
ORDER BY s.sale_number;

-- 5. Line items for discrepant sales
SELECT '=== LINE ITEMS FOR DISCREPANT SALES ===' AS section;
SELECT s.sale_number, si.product_name, si.quantity, si.unit_price,
       si.quantity * si.unit_price AS line_total,
       si.discount_amount AS item_discount, si.tax_amount AS item_tax
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.id IN (
  SELECT s2.id FROM sales s2
  JOIN (
    SELECT sale_id, SUM(quantity * unit_price) AS computed
    FROM sale_items GROUP BY sale_id
  ) items ON items.sale_id = s2.id
  WHERE s2.total_amount != items.computed
)
ORDER BY s.sale_number, si.product_name;

-- 6. Check if discount explains the difference
SELECT '=== SALE DISCREPANCY WITH DISCOUNT/TAX FACTORED ===' AS section;
SELECT s.id, s.sale_number, s.total_amount, s.discount_amount, s.tax_amount,
       items.computed_subtotal,
       items.computed_subtotal - COALESCE(s.discount_amount, 0) + COALESCE(s.tax_amount, 0) AS expected_total,
       s.total_amount - (items.computed_subtotal - COALESCE(s.discount_amount, 0) + COALESCE(s.tax_amount, 0)) AS remaining_diff
FROM sales s
JOIN (
  SELECT sale_id, SUM(quantity * unit_price) AS computed_subtotal
  FROM sale_items GROUP BY sale_id
) items ON items.sale_id = s.id
WHERE s.total_amount != items.computed_subtotal
ORDER BY s.sale_number;

-- 7. Account hierarchy: posting accounts with children
SELECT '=== POSTING ACCOUNTS WITH CHILDREN (hierarchy issue) ===' AS section;
SELECT p."AccountCode" AS parent_code, p."AccountName" AS parent_name,
       p."IsPostingAccount" AS parent_is_posting,
       c."AccountCode" AS child_code, c."AccountName" AS child_name,
       c."IsPostingAccount" AS child_is_posting
FROM accounts p
JOIN accounts c ON c."ParentAccountId" = p."Id"
WHERE p."IsPostingAccount" = true
ORDER BY p."AccountCode", c."AccountCode";

-- 8. Customer balance check with correct table
SELECT '=== CUSTOMER BALANCES ===' AS section;
SELECT id, name, balance FROM customers WHERE balance != 0 ORDER BY name;
