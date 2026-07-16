-- Migration 553: Partner-level withholding tax defaults (SAP/Odoo-style master data)
--
-- Operators mark a supplier/customer as WHT-liable and optionally set a default type.
-- Payment screens auto-select that type (still overrideable).

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS wht_liable BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_wht_type_id UUID NULL;

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS "WhtLiable" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "DefaultWhtTypeId" UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_customers_default_wht_type'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT fk_customers_default_wht_type
      FOREIGN KEY (default_wht_type_id) REFERENCES withholding_tax_types(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_suppliers_default_wht_type'
  ) THEN
    ALTER TABLE suppliers
      ADD CONSTRAINT fk_suppliers_default_wht_type
      FOREIGN KEY ("DefaultWhtTypeId") REFERENCES withholding_tax_types(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customers_wht_liable
  ON customers (wht_liable) WHERE wht_liable = true;

CREATE INDEX IF NOT EXISTS idx_suppliers_wht_liable
  ON suppliers ("WhtLiable") WHERE "WhtLiable" = true;

INSERT INTO schema_version (version) VALUES (553) ON CONFLICT DO NOTHING;
