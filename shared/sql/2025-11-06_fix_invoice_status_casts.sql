-- Ensure invoice status default and trigger casts use invoice_status enum explicitly

ALTER TABLE invoices 
  ALTER COLUMN status SET DEFAULT 'UNPAID'::invoice_status;

CREATE OR REPLACE FUNCTION update_invoice_totals_after_payment()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE invoices
  SET amount_paid = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0),
      balance = GREATEST(total_amount - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0), 0),
      status = CASE 
        WHEN COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0) >= total_amount THEN 'PAID'::invoice_status
        WHEN COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0) > 0 THEN 'PARTIALLY_PAID'::invoice_status
        ELSE 'UNPAID'::invoice_status
      END
  WHERE id = NEW.invoice_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
