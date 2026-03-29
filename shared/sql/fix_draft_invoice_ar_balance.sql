-- Fix: Exclude Draft invoices from customer AR balance calculation
-- Draft invoices have not been issued to the customer and should NOT affect their balance
-- This aligns the trigger with statement queries and proper AR accounting

CREATE OR REPLACE FUNCTION fn_recalculate_customer_ar_balance(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_outstanding NUMERIC;
BEGIN
    -- Sum outstanding balances from all ISSUED invoices for this customer
    -- Exclude: Cancelled, Voided, Draft (not yet issued)
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_total_outstanding
    FROM invoices
    WHERE "CustomerId" = p_customer_id
      AND "Status" NOT IN ('Cancelled', 'Voided', 'Draft');

    -- Update customer balance (customers table uses snake_case)
    UPDATE customers
    SET balance = v_total_outstanding,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;

    RAISE NOTICE 'Updated customer % AR balance to %', p_customer_id, v_total_outstanding;
END;
$$ LANGUAGE plpgsql;
