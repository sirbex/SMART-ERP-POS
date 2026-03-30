-- ============================================================================
-- CUSTOMER BALANCE: CHECK TRIGGER LOGIC + AR SUBMODULE
-- ============================================================================

-- 1. Customer AR sub-accounts
SELECT '=== CUSTOMER AR ACCOUNTS ===' AS info;
SELECT ca."CustomerId", ca."CustomerName", ca."CreditBalance",
       ca."OutstandingReceivables", ca."TotalCreditBalance",
       ca."TotalDepositBalance", ca."AvailableDepositBalance"
FROM customer_accounts ca
ORDER BY ca."CustomerName";

-- 2. What does the balance actually represent? Check the trigger
SELECT '=== PROTECT COMPUTED BALANCES TRIGGER ===' AS info;
SELECT pg_get_functiondef(oid) AS func_def
FROM pg_proc
WHERE proname = 'protect_computed_balances';

-- 3. Check credit sale customer trigger
SELECT '=== CHECK CREDIT SALE CUSTOMER ===' AS info;
SELECT pg_get_functiondef(oid) AS func_def
FROM pg_proc
WHERE proname = 'check_credit_sale_customer';

-- 4. Audit customer balance trigger
SELECT '=== AUDIT CUSTOMER BALANCE ===' AS info;
SELECT pg_get_functiondef(oid) AS func_def
FROM pg_proc
WHERE proname = 'audit_customer_balance_change';
