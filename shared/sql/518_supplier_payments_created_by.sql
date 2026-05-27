-- Migration 518: supplier_payments."CreatedBy" (payment attribution)
--
-- supplierPaymentRepository INSERT/SELECT references "CreatedBy".
-- The column was added only under SamplePOS.Server/db/migrations/018_*,
-- which is NOT applied by tenantMigrationService (shared/sql only).
-- This migration brings tenant databases in line with the server code.

BEGIN;

ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS "CreatedBy" UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by
  ON supplier_payments ("CreatedBy")
  WHERE "CreatedBy" IS NOT NULL;

INSERT INTO schema_version (version) VALUES (517);

COMMIT;
