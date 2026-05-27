-- Record who posted each supplier payment (audit / accountability)
ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS "CreatedBy" UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_created_by
  ON supplier_payments ("CreatedBy")
  WHERE "CreatedBy" IS NOT NULL;
