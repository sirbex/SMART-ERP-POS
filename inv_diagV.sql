SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name IN ('ledger_entries','ledger_transactions') 
AND table_schema='public' 
ORDER BY table_name, ordinal_position;
