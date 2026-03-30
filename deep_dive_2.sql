-- ============================================================================
-- DEEP DIVE ROUND 2: Self-referencing accounts, customer balances, stock
-- ============================================================================

-- 1. Self-referencing account hierarchy issue
SELECT '=== SELF-REFERENCING ACCOUNTS (ParentAccountId = own Id) ===' AS section;
SELECT "AccountCode", "AccountName", "Id", "ParentAccountId",
       CASE WHEN "Id" = "ParentAccountId" THEN 'SELF-REF' ELSE 'OK' END AS status
FROM accounts
WHERE "Id" = "ParentAccountId"
ORDER BY "AccountCode";

-- 2. Full chart of accounts with parent mapping
SELECT '=== FULL CHART OF ACCOUNTS ===' AS section;
SELECT a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance",
       a."Level", a."IsPostingAccount", a."IsActive", a."CurrentBalance",
       p."AccountCode" AS parent_code
FROM accounts a
LEFT JOIN accounts p ON p."Id" = a."ParentAccountId"
ORDER BY a."AccountCode";

-- 3. Product stock: correct column name
SELECT '=== PRODUCT STOCK vs BATCH SUM ===' AS section;
SELECT p.id, p.name, p.quantity_on_hand,
       COALESCE(b.batch_sum, 0) AS batch_sum,
       p.quantity_on_hand - COALESCE(b.batch_sum, 0) AS discrepancy
FROM products p
LEFT JOIN (
  SELECT product_id, SUM(remaining_quantity) AS batch_sum
  FROM inventory_batches
  GROUP BY product_id
) b ON b.product_id = p.id
WHERE p.quantity_on_hand != COALESCE(b.batch_sum, 0)
  AND EXISTS (SELECT 1 FROM inventory_batches WHERE product_id = p.id)
LIMIT 20;

-- 4. Customer balance verification using correct tables
SELECT '=== CUSTOMER BALANCE vs CREDIT SALES ===' AS section;
SELECT c.id, c.name, c.balance AS stored_balance,
       COALESCE(credits.total_credits, 0) AS credit_sales_sum,
       COALESCE(payments.total_payments, 0) AS payments_sum,
       COALESCE(credits.total_credits, 0) - COALESCE(payments.total_payments, 0) AS computed_balance,
       c.balance - (COALESCE(credits.total_credits, 0) - COALESCE(payments.total_payments, 0)) AS discrepancy
FROM customers c
LEFT JOIN (
  SELECT customer_id, SUM(total_amount) AS total_credits
  FROM sales
  WHERE payment_method = 'CREDIT' AND status = 'COMPLETED'
  GROUP BY customer_id
) credits ON credits.customer_id = c.id
LEFT JOIN (
  SELECT customer_id, SUM(amount) AS total_payments
  FROM customer_payments
  GROUP BY customer_id
) payments ON payments.customer_id = c.id
WHERE c.balance != 0
ORDER BY c.name;

-- 5. Sale items columns check
SELECT '=== SALE_ITEMS TABLE COLUMNS ===' AS section;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'sale_items' ORDER BY ordinal_position;

-- 6. Sales GL linkage - check how sales reference GL
SELECT '=== SALES GL TRANSACTION LINKAGE ===' AS section;
SELECT s.sale_number, s.total_amount, s.status,
       lt."TransactionNumber" AS gl_txn
FROM sales s
LEFT JOIN ledger_transactions lt ON lt."ReferenceType" = 'SALE' AND lt."ReferenceId" = s.id::text
WHERE s.status = 'COMPLETED'
ORDER BY s.sale_number
LIMIT 10;

-- 7. Total accounts summary
SELECT '=== ACCOUNT SUMMARY BY TYPE ===' AS section;
SELECT "AccountType", "NormalBalance",
       COUNT(*) AS count,
       SUM("CurrentBalance") AS total_balance
FROM accounts
WHERE "IsPostingAccount" = true
GROUP BY "AccountType", "NormalBalance"
ORDER BY "AccountType";
