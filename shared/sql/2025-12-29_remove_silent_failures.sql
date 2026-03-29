-- ============================================================================
-- SILENT FAILURE REMEDIATION MIGRATION
-- Date: 2025-12-29
-- Purpose: Remove all EXCEPTION WHEN OTHERS THEN blocks that swallow errors
-- 
-- CRITICAL: These patterns allow partial commits in accounting data
-- All triggers must either succeed or fail the entire transaction
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: CUSTOMER/AR TRIGGER FUNCTIONS
-- ============================================================================

-- 1A. fn_sync_customer_on_invoice_change - NO ERROR SWALLOWING
CREATE OR REPLACE FUNCTION fn_sync_customer_on_invoice_change()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_customer_id := OLD."CustomerId";
    ELSE
        v_customer_id := NEW."CustomerId";
        IF TG_OP = 'UPDATE' AND OLD."CustomerId" IS DISTINCT FROM NEW."CustomerId" THEN
            PERFORM fn_recalculate_customer_ar_balance(OLD."CustomerId");
        END IF;
    END IF;
    
    IF v_customer_id IS NOT NULL THEN
        PERFORM fn_recalculate_customer_ar_balance(v_customer_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 1B. fn_recalculate_customer_ar_balance - MUST FAIL ON ERROR
-- CANONICAL FORMULA: SUM(OutstandingBalance) excluding Paid/Cancelled/Voided/Draft
CREATE OR REPLACE FUNCTION fn_recalculate_customer_ar_balance(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_outstanding NUMERIC;
BEGIN
    -- Sum outstanding balances from all ISSUED invoices
    -- Draft invoices are NOT yet issued → excluded from AR
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_total_outstanding
    FROM invoices
    WHERE "CustomerId" = p_customer_id
      AND "Status" NOT IN ('Paid', 'Cancelled', 'Voided', 'Draft');
    
    UPDATE customers
    SET balance = v_total_outstanding,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;
    
    RAISE NOTICE 'Customer % AR balance recalculated to %', p_customer_id, v_total_outstanding;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 1C. fn_sync_invoice_payment - MUST FAIL ON ERROR  
CREATE OR REPLACE FUNCTION fn_sync_invoice_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_invoice_id UUID;
    v_customer_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;
    
    IF v_invoice_id IS NOT NULL THEN
        PERFORM fn_update_invoice_balance_internal(v_invoice_id);
        
        SELECT "CustomerId" INTO v_customer_id FROM invoices WHERE "Id" = v_invoice_id;
        IF v_customer_id IS NOT NULL THEN
            PERFORM fn_recalculate_customer_ar_balance(v_customer_id);
        END IF;
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 1D. fn_update_invoice_balance_internal - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_update_invoice_balance_internal(p_invoice_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_amount NUMERIC;
    v_total_paid NUMERIC;
    v_balance NUMERIC;
    v_new_status TEXT;
BEGIN
    SELECT COALESCE("TotalAmount", 0)
    INTO v_total_amount
    FROM invoices
    WHERE "Id" = p_invoice_id;
    
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM invoice_payments
    WHERE invoice_id = p_invoice_id;
    
    v_balance := v_total_amount - v_total_paid;
    
    IF v_balance <= 0 THEN
        v_new_status := 'Paid';
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'PartiallyPaid';
    ELSE
        v_new_status := 'Unpaid';
    END IF;
    
    UPDATE invoices
    SET "AmountPaid" = v_total_paid,
        "OutstandingBalance" = GREATEST(v_balance, 0),
        "Status" = v_new_status,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_invoice_id;
    
    RAISE NOTICE 'Invoice % balance updated to %, status=%', p_invoice_id, v_balance, v_new_status;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 1E. fn_recalculate_customer_balance - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_recalculate_customer_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'sales' THEN
        IF TG_OP = 'DELETE' THEN
            v_customer_id := OLD.customer_id;
        ELSE
            v_customer_id := NEW.customer_id;
            IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id AND OLD.customer_id IS NOT NULL THEN
                PERFORM fn_update_customer_balance_internal(OLD.customer_id);
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'customer_payments' THEN
        IF TG_OP = 'DELETE' THEN
            v_customer_id := OLD."CustomerId";
        ELSE
            v_customer_id := NEW."CustomerId";
        END IF;
    ELSIF TG_TABLE_NAME = 'credit_notes' THEN
        IF TG_OP = 'DELETE' THEN
            v_customer_id := OLD.customer_id;
        ELSE
            v_customer_id := NEW.customer_id;
        END IF;
    END IF;
    
    IF v_customer_id IS NOT NULL THEN
        PERFORM fn_update_customer_balance_internal(v_customer_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 1F. fn_update_customer_balance_internal - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_update_customer_balance_internal(p_customer_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_credit_sales NUMERIC;
    v_total_payments NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    SELECT COALESCE(SUM(
        CASE 
            WHEN payment_method = 'CREDIT' AND status = 'COMPLETED' 
            THEN total_amount - COALESCE(amount_paid, 0)
            ELSE 0 
        END
    ), 0)
    INTO v_total_credit_sales
    FROM sales
    WHERE customer_id = p_customer_id;
    
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_total_payments
    FROM customer_payments
    WHERE "CustomerId" = p_customer_id
      AND "Status" = 'COMPLETED';
    
    v_new_balance := v_total_credit_sales - v_total_payments;
    
    UPDATE customers
    SET balance = v_new_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;
    
    RAISE NOTICE 'Updated customer % balance to %', p_customer_id, v_new_balance;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 2: SUPPLIER/AP TRIGGER FUNCTIONS
-- ============================================================================

-- 2A. fn_sync_supplier_on_invoice_change - NO ERROR SWALLOWING
CREATE OR REPLACE FUNCTION fn_sync_supplier_on_invoice_change()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_supplier_id := OLD."SupplierId";
    ELSE
        v_supplier_id := NEW."SupplierId";
        IF TG_OP = 'UPDATE' AND OLD."SupplierId" IS DISTINCT FROM NEW."SupplierId" THEN
            PERFORM fn_recalculate_supplier_ap_balance(OLD."SupplierId");
        END IF;
    END IF;
    
    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_recalculate_supplier_ap_balance(v_supplier_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 2B. fn_recalculate_supplier_ap_balance - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_recalculate_supplier_ap_balance(p_supplier_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_invoiced NUMERIC;
    v_total_paid NUMERIC;
    v_new_ap_balance NUMERIC;
BEGIN
    SELECT COALESCE(SUM("TotalAmount"), 0)
    INTO v_total_invoiced
    FROM supplier_invoices
    WHERE "SupplierId" = p_supplier_id
      AND "Status" NOT IN ('Cancelled', 'CANCELLED', 'Draft', 'DRAFT');
    
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_total_paid
    FROM supplier_payments
    WHERE "SupplierId" = p_supplier_id
      AND "Status" = 'COMPLETED';
    
    v_new_ap_balance := v_total_invoiced - v_total_paid;
    
    UPDATE suppliers
    SET balance = v_new_ap_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_supplier_id;
    
    RAISE NOTICE 'Supplier % AP balance recalculated to %', p_supplier_id, v_new_ap_balance;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 2C. fn_sync_supplier_payment_allocation - NO ERROR SWALLOWING
CREATE OR REPLACE FUNCTION fn_sync_supplier_payment_allocation()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_supplier_id := OLD."SupplierId";
    ELSE
        v_supplier_id := NEW."SupplierId";
    END IF;
    
    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_recalculate_supplier_ap_balance(v_supplier_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 2D. fn_recalculate_supplier_balance - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_recalculate_supplier_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'goods_receipts' THEN
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD.supplier_id;
        ELSE
            v_supplier_id := NEW.supplier_id;
        END IF;
    ELSIF TG_TABLE_NAME = 'supplier_payments' THEN
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD."SupplierId";
        ELSE
            v_supplier_id := NEW."SupplierId";
        END IF;
    ELSIF TG_TABLE_NAME = 'purchase_orders' THEN
        IF TG_OP = 'DELETE' THEN
            v_supplier_id := OLD.supplier_id;
        ELSE
            v_supplier_id := NEW.supplier_id;
        END IF;
    END IF;
    
    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_update_supplier_balance_internal(v_supplier_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 3: INVENTORY TRIGGER FUNCTIONS  
-- ============================================================================

-- 3A. fn_recalculate_product_stock - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_recalculate_product_stock()
RETURNS TRIGGER AS $$
DECLARE
    v_product_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
    ELSE
        v_product_id := NEW.product_id;
        IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
            PERFORM fn_update_product_stock_internal(OLD.product_id);
        END IF;
    END IF;
    
    IF v_product_id IS NOT NULL THEN
        PERFORM fn_update_product_stock_internal(v_product_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- 3B. fn_update_product_stock_internal - MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_update_product_stock_internal(p_product_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_quantity NUMERIC;
BEGIN
    SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO v_total_quantity
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND status = 'ACTIVE';
    
    UPDATE products
    SET quantity_on_hand = v_total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_product_id;
    
    RAISE NOTICE 'Updated product % stock to %', p_product_id, v_total_quantity;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - errors must propagate
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PART 4: GL POSTING TRIGGER FUNCTIONS
-- These are CRITICAL - GL failures MUST abort the transaction
-- ============================================================================

-- 4A. fn_post_customer_invoice_to_ledger - CRITICAL: MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_post_customer_invoice_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_line_number INTEGER := 0;
    v_customer_name TEXT;
BEGIN
    IF NEW."Status" IN ('Approved', 'Sent') AND (OLD."Status" IS NULL OR OLD."Status" = 'Draft') THEN
        
        SELECT name INTO v_customer_name FROM customers WHERE id = NEW."CustomerId";
        
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
        
        IF v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: AR account 1200 not found - cannot post invoice';
        END IF;
        
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'INVOICE',
            NEW."Id",
            NEW."InvoiceNumber",
            'Customer Invoice: ' || NEW."InvoiceNumber" || ' - ' || COALESCE(v_customer_name, 'Unknown'),
            NEW."TotalAmount",
            NEW."TotalAmount",
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'DEBIT',
            NEW."TotalAmount", NEW."TotalAmount", 0,
            'AR - Invoice ' || NEW."InvoiceNumber",
            v_line_number, 'INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_revenue_account_id, 'CREDIT',
            NEW."TotalAmount", 0, NEW."TotalAmount",
            'Revenue - Invoice ' || NEW."InvoiceNumber",
            v_line_number, 'INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted customer invoice % to ledger as %', NEW."InvoiceNumber", v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- 4B. fn_post_supplier_invoice_to_ledger - CRITICAL: MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_post_supplier_invoice_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ap_account_id UUID;
    v_expense_account_id UUID;
    v_line_number INTEGER := 0;
    v_supplier_name TEXT;
BEGIN
    IF NEW."Status" IN ('Received', 'Approved') AND (OLD."Status" IS NULL OR OLD."Status" = 'Draft') THEN
        
        SELECT "Name" INTO v_supplier_name FROM suppliers WHERE "Id" = NEW."SupplierId";
        
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2000';
        SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '5100';
        
        IF v_ap_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: AP account 2000 not found - cannot post supplier invoice';
        END IF;
        
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'SUPPLIER_INVOICE',
            NEW."Id",
            NEW."SupplierInvoiceNumber",
            'Supplier Invoice: ' || NEW."SupplierInvoiceNumber" || ' - ' || COALESCE(v_supplier_name, 'Unknown'),
            NEW."TotalAmount",
            NEW."TotalAmount",
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_expense_account_id, 'DEBIT',
            NEW."TotalAmount", NEW."TotalAmount", 0,
            'Expense - ' || NEW."SupplierInvoiceNumber",
            v_line_number, 'SUPPLIER_INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ap_account_id, 'CREDIT',
            NEW."TotalAmount", 0, NEW."TotalAmount",
            'AP - ' || NEW."SupplierInvoiceNumber",
            v_line_number, 'SUPPLIER_INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted supplier invoice % to ledger as %', NEW."SupplierInvoiceNumber", v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- 4C. fn_post_invoice_payment_to_ledger - CRITICAL: MUST FAIL ON ERROR
CREATE OR REPLACE FUNCTION fn_post_invoice_payment_to_ledger()
RETURNS TRIGGER AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_ar_account_id UUID;
    v_invoice_number TEXT;
    v_line_number INTEGER := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT "InvoiceNumber" INTO v_invoice_number FROM invoices WHERE "Id" = NEW.invoice_id;
        
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        
        IF v_cash_account_id IS NULL OR v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'CRITICAL: Cash (1010) or AR (1200) account not found - cannot post payment';
        END IF;
        
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'INVOICE_PAYMENT',
            NEW.id,
            NEW.receipt_number,
            'Invoice Payment: ' || NEW.receipt_number || ' for ' || COALESCE(v_invoice_number, 'Unknown'),
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_cash_account_id, 'DEBIT',
            NEW.amount, NEW.amount, 0,
            'Payment received - ' || NEW.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'CREDIT',
            NEW.amount, 0, NEW.amount,
            'AR reduced - ' || NEW.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted invoice payment % to ledger as %', NEW.receipt_number, v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- REMOVED: EXCEPTION WHEN OTHERS THEN block - GL failures MUST abort transaction
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================

SELECT 'Silent failure remediation complete' AS status;

-- List all functions to verify they no longer have EXCEPTION blocks
SELECT 
    'VERIFIED: ' || p.proname AS function_name,
    CASE 
        WHEN pg_get_functiondef(p.oid) LIKE '%WHEN OTHERS THEN%' 
        THEN 'WARNING: Still has WHEN OTHERS'
        ELSE 'OK: No error swallowing'
    END AS status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fn_sync_customer_on_invoice_change',
    'fn_recalculate_customer_ar_balance',
    'fn_sync_invoice_payment',
    'fn_update_invoice_balance_internal',
    'fn_recalculate_customer_balance',
    'fn_update_customer_balance_internal',
    'fn_sync_supplier_on_invoice_change',
    'fn_recalculate_supplier_ap_balance',
    'fn_sync_supplier_payment_allocation',
    'fn_recalculate_supplier_balance',
    'fn_recalculate_product_stock',
    'fn_update_product_stock_internal',
    'fn_post_customer_invoice_to_ledger',
    'fn_post_supplier_invoice_to_ledger',
    'fn_post_invoice_payment_to_ledger'
  )
ORDER BY p.proname;

COMMIT;
