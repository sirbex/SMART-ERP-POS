-- Check if asset tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('asset_categories', 'fixed_assets', 'depreciation_entries')
ORDER BY table_name;

