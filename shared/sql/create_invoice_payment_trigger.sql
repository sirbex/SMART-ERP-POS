-- ==========================================
-- INVOICE PAYMENT SYNCHRONIZATION TRIGGER
-- ==========================================
-- Purpose: Automatically update sales.amount_paid and customers.balance
-- when invoice payments are recorded to maintain global consistency
-- Date: November 16, 2025

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trg_sync_invoice_payment ON invoice_payments;
DROP FUNCTION IF EXISTS sync_invoice_payment_to_sales_and_customer();

-- Create trigger function
CREATE OR REPLACE FUNCTION sync_invoice_payment_to_sales_and_customer()
RETURNS TRIGGER AS $$
DECLARE
  v_invoice_record RECORD;
  v_total_payments NUMERIC(15,2);
  v_customer_id UUID;
  v_sale_id UUID;
BEGIN
  -- Get invoice details
  SELECT 
    i.id,
    i.customer_id,
    i.sale_id,
    i.total_amount
  INTO v_invoice_record
  FROM invoices i
  WHERE i.id = NEW.invoice_id;

  -- If no invoice found, skip
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_customer_id := v_invoice_record.customer_id;
  v_sale_id := v_invoice_record.sale_id;

  -- Calculate total payments for this invoice
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_payments
  FROM invoice_payments
  WHERE invoice_id = NEW.invoice_id;

  -- Step 1: Update linked sale's amount_paid (if sale exists)
  IF v_sale_id IS NOT NULL THEN
    UPDATE sales
    SET amount_paid = v_total_payments
    WHERE id = v_sale_id;
    
    RAISE NOTICE 'Updated sale % amount_paid to %', v_sale_id, v_total_payments;
  END IF;

  -- Step 2: Recalculate customer balance from ALL credit sales
  -- Balance = SUM of (total_amount - amount_paid) for all CREDIT sales
  UPDATE customers
  SET balance = (
    SELECT COALESCE(SUM(s.total_amount - s.amount_paid), 0)
    FROM sales s
    WHERE s.customer_id = v_customer_id
    AND s.payment_method = 'CREDIT'
    AND s.status = 'COMPLETED'
  ),
  updated_at = CURRENT_TIMESTAMP
  WHERE id = v_customer_id;

  RAISE NOTICE 'Updated customer % balance after payment', v_customer_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that fires AFTER INSERT on invoice_payments
CREATE TRIGGER trg_sync_invoice_payment
  AFTER INSERT ON invoice_payments
  FOR EACH ROW
  EXECUTE FUNCTION sync_invoice_payment_to_sales_and_customer();

-- Add comment for documentation
COMMENT ON TRIGGER trg_sync_invoice_payment ON invoice_payments IS 
  'Automatically syncs invoice payments to sales.amount_paid and recalculates customers.balance for global consistency';
