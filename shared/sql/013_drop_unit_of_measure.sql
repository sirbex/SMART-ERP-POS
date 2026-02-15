-- Migration 013: Drop legacy unit_of_measure column
-- Date: 2025-11-14
-- Description: Remove unit_of_measure column from products table
--              All products now use product_uoms table exclusively

-- IMPORTANT: This is an irreversible breaking change
-- Ensure all code has been updated to use product_uoms before running

BEGIN;

-- Verify all products have product_uoms records
DO $$
DECLARE
  products_count INTEGER;
  products_with_uoms INTEGER;
BEGIN
  SELECT COUNT(*) INTO products_count FROM products;
  SELECT COUNT(DISTINCT product_id) INTO products_with_uoms FROM product_uoms;
  
  IF products_count != products_with_uoms THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: Not all products have product_uoms records. Products: %, With UOMs: %', 
      products_count, products_with_uoms;
  END IF;
  
  RAISE NOTICE 'Safety check passed: All % products have product_uoms records', products_count;
END $$;

-- Drop the legacy column
ALTER TABLE products DROP COLUMN IF EXISTS unit_of_measure;

COMMIT;
