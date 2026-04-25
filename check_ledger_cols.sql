-- 1. Per-product GL 1300 impact vs batch value (find products contributing to drift)
-- First look at ledger_entries columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema='public' AND table_name='ledger_entries'
ORDER BY ordinal_position;
