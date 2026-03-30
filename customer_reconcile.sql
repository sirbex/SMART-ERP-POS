-- ============================================================================
-- CUSTOMER BALANCE RECONCILIATION (corrected column names)
-- ============================================================================

-- 1. Customer credits → uses customer_accounts as FK bridge
SELECT '=== CUSTOMER ACCOUNTS (balances) ===' AS info;
SELECT ca."CustomerId", ca."CustomerName",
       ca."CreditBalance", ca."OutstandingReceivables",
       ca."AvailableDepositBalance", ca."CreditLimit"
FROM customer_accounts ca
WHERE ca."CreditBalance" != 0 OR ca."OutstandingReceivables" != 0
ORDER BY ca."CustomerName";

-- 2. Customer payments (PascalCase columns)
SELECT '=== CUSTOMER PAYMENTS ===' AS info;
SELECT cp."CustomerId", cp."CustomerName",
       SUM(cp."Amount") AS total_paid
FROM customer_payments cp
GROUP BY cp."CustomerId", cp."CustomerName"
ORDER BY cp."CustomerName";

-- 3. Full reconciliation: customers.balance vs credit sales minus payments
SELECT '=== CUSTOMER BALANCE RECONCILIATION ===' AS info;
SELECT c.id, c.name, c.balance AS stored_balance,
       COALESCE(credits.total, 0) AS credit_sales_total,
       COALESCE(payments.total_paid, 0) AS payments_total,
       COALESCE(credits.total, 0) - COALESCE(payments.total_paid, 0) AS computed_balance,
       c.balance - (COALESCE(credits.total, 0) - COALESCE(payments.total_paid, 0)) AS discrepancy
FROM customers c
LEFT JOIN LATERAL (
  SELECT SUM(s.total_amount) AS total
  FROM sales s
  WHERE s.customer_id = c.id AND s.payment_method = 'CREDIT' AND s.status = 'COMPLETED'
) credits ON true
LEFT JOIN LATERAL (
  SELECT SUM(cp."Amount") AS total_paid
  FROM customer_payments cp
  WHERE cp."CustomerId" = c.id
) payments ON true
WHERE c.balance != 0
ORDER BY c.name;

-- 4. Check customer_balance_audit for those customers
SELECT '=== BALANCE AUDIT TRAIL (last 20 entries) ===' AS info;
SELECT ba.customer_name, ba.old_balance, ba.new_balance, ba.change_amount,
       ba.change_source, ba.created_at
FROM customer_balance_audit ba
ORDER BY ba.created_at DESC
LIMIT 20;

-- 5. Verify: matoo mataa and zaman zam zam  - they have balances but no credit sales
SELECT '=== CUSTOMERS WITH BALANCE BUT NO CREDIT SALES ===' AS info;
SELECT c.id, c.name, c.balance
FROM customers c
WHERE c.balance != 0
  AND NOT EXISTS (
    SELECT 1 FROM sales s
    WHERE s.customer_id = c.id AND s.payment_method = 'CREDIT' AND s.status = 'COMPLETED'
  )
ORDER BY c.name;
