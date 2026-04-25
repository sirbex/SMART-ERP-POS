-- Get the actual fn_reconcile_inventory function definition
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'fn_reconcile_inventory';
