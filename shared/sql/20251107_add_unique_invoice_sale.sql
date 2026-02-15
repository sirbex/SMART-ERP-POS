-- Ensure only one invoice exists per sale
-- Safe to run multiple times; IF NOT EXISTS prevents duplication
CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_sale_id
ON invoices (sale_id)
WHERE sale_id IS NOT NULL;
