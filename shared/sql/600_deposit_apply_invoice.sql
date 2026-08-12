-- 600: Deposit applications may target an invoice (not only a sale).
-- Receive Payment on invoices without a sale_id must not fail the sales(id) FK
-- by stuffing the invoice UUID into sale_id.
--
-- Identity: at least one of sale_id / invoice_id is required.
-- Existing rows keep sale_id; new invoice-only applies set invoice_id.

ALTER TABLE pos_deposit_applications
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id);

ALTER TABLE pos_deposit_applications
  ALTER COLUMN sale_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_deposit_app_target'
  ) THEN
    ALTER TABLE pos_deposit_applications
      ADD CONSTRAINT chk_deposit_app_target
      CHECK (sale_id IS NOT NULL OR invoice_id IS NOT NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deposit_applications_invoice
  ON pos_deposit_applications(invoice_id)
  WHERE invoice_id IS NOT NULL;

COMMENT ON COLUMN pos_deposit_applications.invoice_id IS
  'Invoice cleared by this deposit application (Receive Payment). Required when sale_id is null.';
COMMENT ON COLUMN pos_deposit_applications.sale_id IS
  'Sale the deposit was applied to. Nullable when applying to a standalone invoice.';
