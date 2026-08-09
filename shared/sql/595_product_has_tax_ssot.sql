-- Migration 595: enforce product tax flag SSOT (has_tax mirrors is_taxable)
-- DocumentTax bridge uses is_taxable only; has_tax is legacy and must not diverge.

UPDATE products
SET has_tax = COALESCE(is_taxable, false)
WHERE has_tax IS DISTINCT FROM COALESCE(is_taxable, false);

COMMENT ON COLUMN products.has_tax IS
  'Legacy flag; SSOT is is_taxable. Maintained in lockstep on product write (migration 595).';
COMMENT ON COLUMN products.is_taxable IS
  'SSOT VAT liability for DocumentTax product bridge (loadProductTaxBridge).';
