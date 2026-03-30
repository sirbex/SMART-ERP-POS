-- ============================================================================
-- CUSTOMER BALANCE: TRIGGER & DEPOSIT INVESTIGATION
-- ============================================================================

-- 1. What triggers exist on sales or customer tables?
SELECT '=== TRIGGERS ON SALES ===' AS info;
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'sales';

-- 2. Triggers on customers
SELECT '=== TRIGGERS ON CUSTOMERS ===' AS info;
SELECT trigger_name, event_manipulation, action_statement
FROM information_schema.triggers
WHERE event_object_table = 'customers';

-- 3. Customer deposits
SELECT '=== CUSTOMER DEPOSITS ===' AS info;
SELECT * FROM customer_deposits ORDER BY "CreatedAt" DESC LIMIT 10;

-- 4. POS customer deposits
SELECT '=== POS CUSTOMER DEPOSITS ===' AS info;
SELECT * FROM pos_customer_deposits ORDER BY created_at DESC LIMIT 10;

-- 5. All sales for the problematic customers (includes non-CREDIT payment methods)
SELECT '=== ALL SALES FOR CUSTOMERS WITH BALANCES ===' AS info;
SELECT c.name, s.sale_number, s.total_amount, s.payment_method, s.status, s.sale_date
FROM customers c
JOIN sales s ON s.customer_id = c.id
WHERE c.balance != 0
ORDER BY c.name, s.sale_number;

-- 6. Check for balance adjustments
SELECT '=== CUSTOMER BALANCE ADJUSTMENTS ===' AS info;
SELECT * FROM customer_balance_adjustments LIMIT 10;

-- 7. Customer deposit summary
SELECT '=== CUSTOMER DEPOSIT SUMMARY ===' AS info;
SELECT * FROM customer_deposit_summary LIMIT 10;
