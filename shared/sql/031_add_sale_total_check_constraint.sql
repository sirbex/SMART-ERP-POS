-- Migration: 031_add_sale_total_check_constraint.sql
-- Description: Add database-level constraint to prevent subtotal/total swap corruption
-- Date: 2026-01-01
-- 
-- This constraint ensures that sale totals are internally consistent:
-- total_amount should approximately equal subtotal - discount_amount + tax_amount
-- 
-- The constraint allows a small tolerance (1.00) for floating point rounding

-- First, check for any existing violations before adding constraint
DO $$
DECLARE
  violation_count INTEGER;
  r RECORD;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM sales
  WHERE ABS((subtotal - COALESCE(discount_amount, 0) + COALESCE(tax_amount, 0)) - total_amount) > 1.00;
  
  IF violation_count > 0 THEN
    RAISE NOTICE 'Found % sales with inconsistent totals. These should be reviewed:', violation_count;
    
    -- Log the violations
    FOR r IN (
      SELECT sale_number, subtotal, discount_amount, tax_amount, total_amount,
             (subtotal - COALESCE(discount_amount, 0) + COALESCE(tax_amount, 0)) as expected_total,
             ABS((subtotal - COALESCE(discount_amount, 0) + COALESCE(tax_amount, 0)) - total_amount) as difference
      FROM sales
      WHERE ABS((subtotal - COALESCE(discount_amount, 0) + COALESCE(tax_amount, 0)) - total_amount) > 1.00
      ORDER BY sale_number
    ) LOOP
      RAISE NOTICE 'Sale %: subtotal=%, discount=%, tax=%, total=%, expected=%, diff=%',
        r.sale_number, r.subtotal, r.discount_amount, r.tax_amount, r.total_amount, r.expected_total, r.difference;
    END LOOP;
  END IF;
END $$;

-- Add check constraint to prevent future violations
-- Note: Using a function-based check for cleaner syntax
CREATE OR REPLACE FUNCTION fn_validate_sale_totals()
RETURNS TRIGGER AS $$
DECLARE
  expected_total NUMERIC(15,2);
  tolerance NUMERIC(15,2) := 1.00; -- Allow 1 unit tolerance for rounding
BEGIN
  -- Calculate expected total: subtotal - discount + tax
  expected_total := NEW.subtotal - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.tax_amount, 0);
  
  -- Check if total matches expected (within tolerance)
  IF ABS(expected_total - NEW.total_amount) > tolerance THEN
    RAISE EXCEPTION 'Sale total validation failed: expected % but got %. subtotal=%, discount=%, tax=%',
      expected_total, NEW.total_amount, NEW.subtotal, COALESCE(NEW.discount_amount, 0), COALESCE(NEW.tax_amount, 0);
  END IF;
  
  -- Additional check: if tax exists, total should be >= subtotal (after discount)
  IF COALESCE(NEW.tax_amount, 0) > 0 AND NEW.total_amount < (NEW.subtotal - COALESCE(NEW.discount_amount, 0)) THEN
    RAISE EXCEPTION 'Sale total validation failed: total (%) cannot be less than subtotal minus discount (%) when tax exists (%)',
      NEW.total_amount, (NEW.subtotal - COALESCE(NEW.discount_amount, 0)), NEW.tax_amount;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_validate_sale_totals ON sales;

-- Create trigger to validate on INSERT and UPDATE
CREATE TRIGGER trg_validate_sale_totals
  BEFORE INSERT OR UPDATE ON sales
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_sale_totals();

-- Also add similar validation for quotations to catch issues at quote creation time
CREATE OR REPLACE FUNCTION fn_validate_quotation_totals()
RETURNS TRIGGER AS $$
DECLARE
  expected_total NUMERIC(15,2);
  tolerance NUMERIC(15,2) := 1.00;
BEGIN
  -- Calculate expected total: subtotal - discount + tax
  expected_total := NEW.subtotal - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.tax_amount, 0);
  
  -- Check if total matches expected (within tolerance)
  IF ABS(expected_total - NEW.total_amount) > tolerance THEN
    RAISE EXCEPTION 'Quotation total validation failed: expected % but got %. subtotal=%, discount=%, tax=%',
      expected_total, NEW.total_amount, NEW.subtotal, COALESCE(NEW.discount_amount, 0), COALESCE(NEW.tax_amount, 0);
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_validate_quotation_totals ON quotations;

-- Create trigger for quotations
CREATE TRIGGER trg_validate_quotation_totals
  BEFORE INSERT OR UPDATE ON quotations
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_quotation_totals();

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'Sale and quotation total validation triggers installed successfully';
  RAISE NOTICE 'These triggers will prevent subtotal/total swap corruption';
END $$;
