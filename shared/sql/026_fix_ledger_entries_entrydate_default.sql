-- ============================================================================
-- Migration: Fix ledger_entries.EntryDate default value
-- Date: 2025-12-31
-- Issue: The EntryDate column had a default of '-infinity' which caused
--        "cannot convert infinity to integer" errors when fn_enforce_open_period
--        tried to extract YEAR/MONTH from the date.
-- ============================================================================

-- Fix 1: Change the default from '-infinity' to CURRENT_TIMESTAMP
ALTER TABLE ledger_entries 
ALTER COLUMN "EntryDate" SET DEFAULT CURRENT_TIMESTAMP;

-- Fix 2: Update any existing rows that have '-infinity' 
-- Use CreatedAt as the fallback date
UPDATE ledger_entries 
SET "EntryDate" = "CreatedAt" 
WHERE "EntryDate" = '-infinity'::timestamptz;

-- Verify the fix
DO $$ 
DECLARE
    bad_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO bad_count 
    FROM ledger_entries 
    WHERE "EntryDate" = '-infinity'::timestamptz;
    
    IF bad_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: % rows still have -infinity EntryDate', bad_count;
    END IF;
    
    RAISE NOTICE 'Migration successful: EntryDate default fixed to CURRENT_TIMESTAMP';
END $$;
