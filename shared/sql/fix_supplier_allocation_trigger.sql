-- Fix fn_sync_supplier_payment_allocation trigger function
-- The column name is AmountAllocated, not Amount

CREATE OR REPLACE FUNCTION public.fn_sync_supplier_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
    v_invoice_id UUID;
    v_supplier_id UUID;
    v_total_paid NUMERIC;
    v_total_amount NUMERIC;
    v_new_status TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD."SupplierInvoiceId";
    ELSE
        v_invoice_id := NEW."SupplierInvoiceId";
    END IF;
    
    -- Get invoice details (supplier_invoices uses PascalCase)
    SELECT "SupplierId", "TotalAmount"
    INTO v_supplier_id, v_total_amount
    FROM supplier_invoices WHERE "Id" = v_invoice_id;
    
    -- Sum all allocations for this invoice
    -- FIXED: Column is AmountAllocated, not Amount
    SELECT COALESCE(SUM("AmountAllocated"), 0)
    INTO v_total_paid
    FROM supplier_payment_allocations
    WHERE "SupplierInvoiceId" = v_invoice_id
      AND deleted_at IS NULL;
    
    -- Determine new status
    IF v_total_paid >= v_total_amount THEN
        v_new_status := 'Paid';
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'PartiallyPaid';
    ELSE
        v_new_status := 'Unpaid';
    END IF;
    
    -- Update supplier invoice
    UPDATE supplier_invoices
    SET "AmountPaid" = v_total_paid,
        "OutstandingBalance" = GREATEST(v_total_amount - v_total_paid, 0),
        "Status" = v_new_status,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = v_invoice_id;
    
    -- Update supplier AP balance
    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_recalculate_supplier_ap_balance(v_supplier_id);
    END IF;
    
    RAISE NOTICE 'Supplier invoice % updated: paid=%, status=%', v_invoice_id, v_total_paid, v_new_status;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$function$;
