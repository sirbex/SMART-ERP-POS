-- ============================================================================
-- CUSTOMER BALANCE DEEP VERIFICATION
-- ============================================================================

-- 1. Customer payments table structure
SELECT '=== CUSTOMER_PAYMENTS COLUMNS ===' AS info;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customer_payments' ORDER BY ordinal_position;

-- 2. Customer credits table structure
SELECT '=== CUSTOMER_CREDITS COLUMNS ===' AS info;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customer_credits' ORDER BY ordinal_position;

-- 3. Customer accounts table structure
SELECT '=== CUSTOMER_ACCOUNTS COLUMNS ===' AS info;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customer_accounts' ORDER BY ordinal_position;

-- 4. Customer balance audit table
SELECT '=== CUSTOMER_BALANCE_AUDIT COLUMNS ===' AS info;
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'customer_balance_audit' ORDER BY ordinal_position;

-- 5. Customers with non-zero balances
SELECT '=== CUSTOMERS WITH BALANCES ===' AS info;
SELECT c.id, c.name, c.balance,
       (SELECT COUNT(*) FROM customer_credits cc WHERE cc.customer_id = c.id) AS credit_records,
       (SELECT COUNT(*) FROM customer_payments cp WHERE cp.customer_id = c.id) AS payment_records
FROM customers c
WHERE c.balance != 0
ORDER BY c.name;

-- 6. Credit sale totals per customer
SELECT '=== CREDIT SALES PER CUSTOMER ===' AS info;
SELECT c.id, c.name,
       COUNT(s.id) AS credit_sale_count,
       COALESCE(SUM(s.total_amount), 0) AS total_credit_sales
FROM customers c
JOIN sales s ON s.customer_id = c.id AND s.payment_method = 'CREDIT' AND s.status = 'COMPLETED'
GROUP BY c.id, c.name
ORDER BY c.name;

-- 7. Customer payments summary
SELECT '=== CUSTOMER PAYMENTS ===' AS info;
SELECT cp.customer_id, c.name, SUM(cp.amount) AS total_paid
FROM customer_payments cp
JOIN customers c ON c.id = cp.customer_id
GROUP BY cp.customer_id, c.name
ORDER BY c.name;

-- 8. Customer balance reconciliation
SELECT '=== CUSTOMER BALANCE RECONCILIATION ===' AS info;
SELECT c.id, c.name, c.balance AS stored_balance,
       COALESCE(credits_sum.total, 0) AS total_credit_sales,
       COALESCE(payments_sum.total, 0) AS total_payments,
       COALESCE(credits_sum.total, 0) - COALESCE(payments_sum.total, 0) AS computed_balance,
       c.balance - (COALESCE(credits_sum.total, 0) - COALESCE(payments_sum.total, 0)) AS discrepancy
FROM customers c
LEFT JOIN LATERAL (
  SELECT SUM(s.total_amount) AS total
  FROM sales s
  WHERE s.customer_id = c.id AND s.payment_method = 'CREDIT' AND s.status = 'COMPLETED'
) credits_sum ON true
LEFT JOIN LATERAL (
  SELECT SUM(cp.amount) AS total
  FROM customer_payments cp
  WHERE cp.customer_id = c.id
) payments_sum ON true
WHERE c.balance != 0
ORDER BY c.name;
