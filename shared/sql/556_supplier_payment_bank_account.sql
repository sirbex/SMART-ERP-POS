-- ============================================================================
-- 556_supplier_payment_bank_account.sql
-- Pay-from bank book on supplier payments (SAP house bank / Odoo journal / Tally ledger).
-- ============================================================================

ALTER TABLE supplier_payments
  ADD COLUMN IF NOT EXISTS bank_account_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_supplier_payments_bank_account'
  ) THEN
    ALTER TABLE supplier_payments
      ADD CONSTRAINT fk_supplier_payments_bank_account
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- bank_accounts may not exist in very old tenants
END $$;

CREATE INDEX IF NOT EXISTS idx_supplier_payments_bank_account
  ON supplier_payments (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

INSERT INTO schema_version (version) VALUES (556) ON CONFLICT DO NOTHING;
