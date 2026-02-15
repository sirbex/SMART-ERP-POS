-- Prevent status changes on converted quotations
-- Safety net trigger - blocks any attempt to change status after conversion

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS tr_protect_converted_quotation ON quotations;
DROP FUNCTION IF EXISTS fn_protect_converted_quotation();

-- Create protection function
CREATE OR REPLACE FUNCTION fn_protect_converted_quotation()
RETURNS TRIGGER AS $$
BEGIN
    -- If the quotation was already CONVERTED, block status changes
    IF OLD.status = 'CONVERTED' AND NEW.status != 'CONVERTED' THEN
        RAISE EXCEPTION 'Cannot change status of a converted quotation (%). The deal is closed.', OLD.quote_number;
    END IF;

    -- If quotation has a linked sale, block all status changes
    IF OLD.converted_to_sale_id IS NOT NULL AND OLD.status != NEW.status THEN
        RAISE EXCEPTION 'Cannot change status. Quotation % has been converted to sale %. Transaction is complete.', 
            OLD.quote_number, OLD.converted_to_sale_id;
    END IF;

    -- Block attempts to clear converted_to_sale_id (prevent unlinking sales)
    IF OLD.converted_to_sale_id IS NOT NULL AND NEW.converted_to_sale_id IS NULL THEN
        RAISE EXCEPTION 'Cannot unlink quotation % from sale %. Transaction records must remain intact.', 
            OLD.quote_number, OLD.converted_to_sale_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER tr_protect_converted_quotation
    BEFORE UPDATE ON quotations
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_converted_quotation();

-- Add comment
COMMENT ON TRIGGER tr_protect_converted_quotation ON quotations IS 
    'Prevents status changes on converted quotations - once a deal is closed, it cannot be modified';

-- Log successful creation
DO $$
BEGIN
    RAISE NOTICE 'Trigger tr_protect_converted_quotation created successfully';
END $$;
