-- ============================================================================
-- CHECK THE SALE POSTING TRIGGER THAT UPDATES CUSTOMER BALANCE
-- ============================================================================

SELECT '=== fn_post_sale_to_ledger ===' AS info;
SELECT pg_get_functiondef(oid) AS func_def
FROM pg_proc
WHERE proname = 'fn_post_sale_to_ledger';

SELECT '=== fn_post_sale_void_to_ledger ===' AS info;
SELECT pg_get_functiondef(oid) AS func_def
FROM pg_proc
WHERE proname = 'fn_post_sale_void_to_ledger';

SELECT '=== validate_sale_payment ===' AS info;
SELECT pg_get_functiondef(oid) AS func_def
FROM pg_proc
WHERE proname = 'validate_sale_payment';
