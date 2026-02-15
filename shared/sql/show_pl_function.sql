-- Get function definition
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_get_profit_loss';
