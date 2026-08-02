-- Migration 582: Customer Tax Profile (DocumentTaxService Phase 4)
-- Structured VAT profile on customers — extends tax_exemptions, does not replace WHT.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS vat_registered BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tin VARCHAR(50),
  ADD COLUMN IF NOT EXISTS tax_profile VARCHAR(30) NOT NULL DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS default_vat_rate NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS vat_registration_date DATE,
  ADD COLUMN IF NOT EXISTS tax_effective_from DATE,
  ADD COLUMN IF NOT EXISTS tax_exempt BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS allow_tax_override BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_customers_tax_profile'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT chk_customers_tax_profile
      CHECK (tax_profile IN ('STANDARD', 'VAT_REGISTERED', 'EXEMPT', 'ZERO_RATED'));
  END IF;
END $$;

COMMENT ON COLUMN customers.vat_registered IS
  'When true, customer is VAT-registered for output VAT determination.';
COMMENT ON COLUMN customers.tin IS
  'Customer TIN / VAT registration number.';
COMMENT ON COLUMN customers.tax_profile IS
  'STANDARD | VAT_REGISTERED | EXEMPT | ZERO_RATED — DocumentTaxService profile.';
COMMENT ON COLUMN customers.default_vat_rate IS
  'Optional customer default VAT % when product mapping/bridge unresolved.';
COMMENT ON COLUMN customers.tax_exempt IS
  'Profile-level exemption (OR with tax_exemptions table).';
COMMENT ON COLUMN customers.allow_tax_override IS
  'When true, privileged users may override document tax treatment (audit later).';

CREATE INDEX IF NOT EXISTS idx_customers_vat_registered
  ON customers (vat_registered) WHERE vat_registered = true;
CREATE INDEX IF NOT EXISTS idx_customers_tax_exempt
  ON customers (tax_exempt) WHERE tax_exempt = true;

-- Tenant policy: when true, walk-in / non-registered customers get no output VAT.
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS vat_output_requires_registered_customer BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN system_settings.vat_output_requires_registered_customer IS
  'When true, DocumentTaxService applies output VAT only for VAT-registered customers (walk-in = 0).';

INSERT INTO schema_version (version) VALUES (582) ON CONFLICT DO NOTHING;
