-- Migration: Remove product_number trigger (move to application layer)
-- Date: March 2026
-- Purpose: Triggers fire on INSERT even during UPSERT (ON CONFLICT DO UPDATE),
--          generating colliding product numbers. SAP/Odoo best practice:
--          generate business IDs in the application layer ONLY on true creates.
--
-- The sequence (product_number_seq) is KEPT — used by app-layer
-- generateProductNumber() in productRepository.ts.

-- Drop the trigger
DROP TRIGGER IF EXISTS trigger_generate_product_number ON products;

-- Drop the function (no longer needed)
DROP FUNCTION IF EXISTS generate_product_number();

-- Sync sequence past existing product numbers so app-layer starts correctly
SELECT setval('product_number_seq',
  (SELECT COALESCE(MAX(CAST(SUBSTRING(product_number FROM 6) AS INTEGER)), 0)
   FROM products WHERE product_number LIKE 'PROD-%')
);

-- Verify
DO $$
DECLARE
  trig_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_generate_product_number'
  ) INTO trig_exists;
  
  IF trig_exists THEN
    RAISE EXCEPTION 'Migration failed: trigger still exists!';
  END IF;
  
  RAISE NOTICE 'Migration 030 complete: product_number trigger removed, sequence synced.';
END $$;
