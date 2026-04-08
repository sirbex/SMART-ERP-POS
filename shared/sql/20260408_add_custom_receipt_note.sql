-- Add custom free-text field for receipts
-- Users can put anything here: MoMo numbers, promo messages, etc.
ALTER TABLE invoice_settings
  ADD COLUMN IF NOT EXISTS custom_receipt_note TEXT;
