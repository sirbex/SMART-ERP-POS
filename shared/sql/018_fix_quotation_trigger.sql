-- Migration 018: Fix Quotation Status Change Trigger
-- Fixes the trigger that references non-existent updated_by_id field
-- Date: November 28, 2025

-- Drop and recreate the trigger function without the updated_by_id reference
CREATE OR REPLACE FUNCTION log_quotation_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO quotation_status_history (
      quotation_id,
      from_status,
      to_status,
      notes,
      changed_by_id
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      NULL  -- Set to NULL since updated_by_id field doesn't exist yet
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger already exists, this will update the function
-- The trigger definition remains the same:
-- CREATE TRIGGER trg_log_quote_status_change
--   AFTER UPDATE ON quotations
--   FOR EACH ROW
--   WHEN (OLD.status IS DISTINCT FROM NEW.status)
--   EXECUTE FUNCTION log_quotation_status_change();