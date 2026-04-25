-- Check actual column names for key tables
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name IN ('journal_entry_lines','journal_entries','accounts','stock_movements')
ORDER BY table_name, ordinal_position;
