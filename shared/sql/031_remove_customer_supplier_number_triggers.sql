-- Migration: Remove customer_number trigger (move to application layer)
-- Date: April 2026
-- Same fix as 030 for products: triggers + UPSERT = collision.
-- Sequence kept for app-layer generateCustomerNumber().

DROP TRIGGER IF EXISTS trigger_generate_customer_number ON customers;
DROP FUNCTION IF EXISTS generate_customer_number();

-- Also drop supplier trigger/function if they exist (they don't on current schema
-- because suppliers use PascalCase columns, but clean up the orphaned function)
DROP TRIGGER IF EXISTS trigger_generate_supplier_number ON suppliers;
DROP FUNCTION IF EXISTS generate_supplier_number();

-- Sync customer sequence past existing numbers
SELECT setval('customer_number_seq',
  (SELECT COALESCE(MAX(CAST(SUBSTRING(customer_number FROM 6) AS INTEGER)), 0)
   FROM customers WHERE customer_number LIKE 'CUST-%')
);

-- Verify
DO $$
BEGIN
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgname = 'trigger_generate_customer_number') THEN
    RAISE EXCEPTION 'Migration failed: customer trigger still exists!';
  END IF;
  RAISE NOTICE 'Migration 031 complete: customer/supplier number triggers removed.';
END $$;
