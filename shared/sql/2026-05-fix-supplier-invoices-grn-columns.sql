-- Migration: add grn_computed_total and variance_reason to supplier_invoices
-- These columns are required by postInvoiceToGL to handle 3-way match variance accounting.
-- Without them, every call to postInvoiceToGL fails with "column does not exist",
-- leaving all invoices created via createInvoiceFromGRN with is_posted_to_gl = FALSE.
--
-- Safe to run multiple times (idempotent via IF NOT EXISTS).

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS grn_computed_total NUMERIC(18,6) NULL,
  ADD COLUMN IF NOT EXISTS variance_reason    VARCHAR(50)   NULL;

-- Backfill comment: existing invoices will have NULL for both columns,
-- which is handled correctly by postInvoiceToGL (NULL grn_computed_total = no variance = 2-line entry).

SELECT 'Migration complete: grn_computed_total and variance_reason added to supplier_invoices' AS status;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'supplier_invoices'
  AND column_name IN ('grn_computed_total', 'variance_reason')
ORDER BY column_name;
