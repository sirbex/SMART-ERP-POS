-- Migration 584: DocumentTax Phase 6 — persist line tax on sale_items
-- Mirrors quotation_items tax columns so POS/createSale leave an audit SSOT.

ALTER TABLE sale_items
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(10, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_taxable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tax_determination VARCHAR(30);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_sale_items_tax_determination'
  ) THEN
    ALTER TABLE sale_items
      ADD CONSTRAINT chk_sale_items_tax_determination
      CHECK (
        tax_determination IS NULL
        OR tax_determination IN (
          'EXEMPT', 'MAPPING', 'BRIDGE', 'TENANT_DEFAULT',
          'NONE', 'DISABLED', 'OVERRIDE'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN sale_items.tax_amount IS
  'DocumentTaxService line tax amount (TaxEngine.compute) at posting.';
COMMENT ON COLUMN sale_items.tax_rate IS
  'Effective percentage rate applied (0 when exempt/none).';
COMMENT ON COLUMN sale_items.tax_determination IS
  'DocumentTax determination path: EXEMPT|MAPPING|BRIDGE|TENANT_DEFAULT|NONE|DISABLED|OVERRIDE.';

INSERT INTO schema_version (version) VALUES (584) ON CONFLICT DO NOTHING;
