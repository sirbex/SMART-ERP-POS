-- Show the actual trigger function that's working
SELECT pg_get_functiondef(oid) 
FROM pg_proc 
WHERE proname = 'fn_post_sale_to_ledger';
