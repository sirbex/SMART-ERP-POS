-- Migration: Supplier Invoice Variance Handling
-- Adds columns to support 3-way match GR/IR variance enforcement
-- Aligns with SAP MIRO / Odoo Vendor Bill reconciliation discipline
--
-- SAFE: Both columns are nullable; existing invoices (no variance) remain intact.

ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS grn_computed_total DECIMAL(15,4),
  ADD COLUMN IF NOT EXISTS variance_reason    VARCHAR(50);

COMMENT ON COLUMN supplier_invoices.grn_computed_total IS
  'PricingEngine-computed total from the linked GRN at billing time (qty × unitCost). '
  'NULL means no GRN was linked or total was not recorded. '
  'When non-null and different from TotalAmount, a GL variance line is posted to 5020.';

COMMENT ON COLUMN supplier_invoices.variance_reason IS
  'Why the supplier-reported total differs from grn_computed_total. '
  'Values: SUPPLIER_DISCOUNT | ROUNDING_DIFFERENCE | PRICE_VARIANCE. '
  'NULL = no variance or pre-migration invoice.';
