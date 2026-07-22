-- ============================================================================
-- 559_ar_customer_payment_bank_account.sql
-- Optional bank book on AR customer receipts (parity with supplier_payments.bank_account_id).
-- Code in arPaymentRepository.createPaymentHeader inserts bank_account_id; migration 418
-- never added the column, so POST customer payment fails with:
--   column "bank_account_id" of relation "ar_customer_payments" does not exist
-- ============================================================================

ALTER TABLE ar_customer_payments
  ADD COLUMN IF NOT EXISTS bank_account_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_ar_customer_payments_bank_account'
  ) THEN
    ALTER TABLE ar_customer_payments
      ADD CONSTRAINT fk_ar_customer_payments_bank_account
      FOREIGN KEY (bank_account_id) REFERENCES bank_accounts(id);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- bank_accounts may not exist in very old tenants
END $$;

CREATE INDEX IF NOT EXISTS idx_ar_customer_payments_bank_account
  ON ar_customer_payments (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

INSERT INTO schema_version (version) VALUES (559) ON CONFLICT DO NOTHING;
