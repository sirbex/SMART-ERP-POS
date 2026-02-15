--
-- PostgreSQL database dump
--

-- Dumped from database version 16.8
-- Dumped by pg_dump version 16.8

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION "uuid-ossp" IS 'Required for UUID generation if used in initial schema';


--
-- Name: batch_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.batch_status AS ENUM (
    'ACTIVE',
    'DEPLETED',
    'EXPIRED',
    'QUARANTINED'
);


--
-- Name: costing_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.costing_method AS ENUM (
    'FIFO',
    'AVCO',
    'STANDARD'
);


--
-- Name: goods_receipt_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.goods_receipt_status AS ENUM (
    'DRAFT',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'UNPAID',
    'PARTIALLY_PAID',
    'PAID',
    'CANCELLED'
);


--
-- Name: movement_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.movement_type AS ENUM (
    'GOODS_RECEIPT',
    'SALE',
    'ADJUSTMENT_IN',
    'ADJUSTMENT_OUT',
    'TRANSFER_IN',
    'TRANSFER_OUT',
    'RETURN',
    'DAMAGE',
    'EXPIRY'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'CASH',
    'CARD',
    'MOBILE_MONEY',
    'BANK_TRANSFER',
    'CREDIT',
    'DEPOSIT'
);


--
-- Name: payment_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_status AS ENUM (
    'PENDING',
    'PARTIAL',
    'PAID',
    'OVERDUE',
    'CANCELLED'
);


--
-- Name: purchase_order_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.purchase_order_status AS ENUM (
    'DRAFT',
    'PENDING',
    'COMPLETED',
    'CANCELLED'
);


--
-- Name: quotation_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quotation_status AS ENUM (
    'DRAFT',
    'SENT',
    'ACCEPTED',
    'REJECTED',
    'EXPIRED',
    'CONVERTED',
    'CANCELLED'
);


--
-- Name: quote_item_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quote_item_type AS ENUM (
    'product',
    'service',
    'custom'
);


--
-- Name: quote_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.quote_type AS ENUM (
    'quick',
    'standard'
);


--
-- Name: report_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.report_type AS ENUM (
    'INVENTORY_VALUATION',
    'INVENTORY_ADJUSTMENTS',
    'SALES_REPORT',
    'EXPIRING_ITEMS',
    'LOW_STOCK',
    'BEST_SELLING_PRODUCTS',
    'SUPPLIER_COST_ANALYSIS',
    'GOODS_RECEIVED',
    'PAYMENT_REPORT',
    'CUSTOMER_PAYMENTS',
    'DELETED_ITEMS',
    'DELETED_CUSTOMERS',
    'PRODUCT_SALES_DETAIL',
    'PROFIT_LOSS'
);


--
-- Name: sale_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sale_status AS ENUM (
    'COMPLETED',
    'VOID',
    'REFUNDED'
);


--
-- Name: stock_count_state; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.stock_count_state AS ENUM (
    'draft',
    'counting',
    'validating',
    'done',
    'cancelled'
);


--
-- Name: audit_customer_balance_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.audit_customer_balance_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        INSERT INTO customer_balance_audit (
            customer_id,
            customer_name,
            old_balance,
            new_balance,
            change_amount,
            change_source
        ) VALUES (
            NEW.id,
            NEW.name,
            COALESCE(OLD.balance, 0),
            COALESCE(NEW.balance, 0),
            COALESCE(NEW.balance, 0) - COALESCE(OLD.balance, 0),
            'TRIGGER'
        );
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: auto_expire_quotes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_expire_quotes() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE quotations
  SET status = 'EXPIRED'::quotation_status,
      updated_at = NOW()
  WHERE valid_until < CURRENT_DATE
    AND status NOT IN ('CONVERTED', 'CANCELLED', 'EXPIRED', 'REJECTED');
END;
$$;


--
-- Name: FUNCTION auto_expire_quotes(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.auto_expire_quotes() IS 'Run daily to automatically expire quotes past their valid_until date';


--
-- Name: auto_populate_gr_po_item_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_populate_gr_po_item_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only auto-populate if:
  -- 1. po_item_id is NULL (not explicitly set)
  -- 2. The GR is linked to a PO (has purchase_order_id)
  IF NEW.po_item_id IS NULL THEN
    -- Find the matching PO item by product_id
    SELECT poi.id INTO NEW.po_item_id
    FROM goods_receipts gr
    JOIN purchase_order_items poi ON poi.purchase_order_id = gr.purchase_order_id
    WHERE gr.id = NEW.goods_receipt_id
      AND poi.product_id = NEW.product_id
    LIMIT 1;
    
    -- Log if we found a match
    IF NEW.po_item_id IS NOT NULL THEN
      RAISE NOTICE 'Auto-populated po_item_id for GR item: product_id=%, po_item_id=%', 
        NEW.product_id, NEW.po_item_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: check_ap_reconciliation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_ap_reconciliation() RETURNS TABLE(gl_balance numeric, subledger_balance numeric, difference numeric, is_balanced boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100') as gl_balance,
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers) as subledger_balance,
        (SELECT COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100') - 
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers) as difference,
        ABS((SELECT COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '2100') - 
        (SELECT COALESCE(SUM("OutstandingBalance"), 0) FROM suppliers)) < 0.01 as is_balanced;
END;
$$;


--
-- Name: check_ar_reconciliation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_ar_reconciliation() RETURNS TABLE(gl_balance numeric, subledger_balance numeric, difference numeric, is_balanced boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200') as gl_balance,
        (SELECT COALESCE(SUM(balance), 0) FROM customers) as subledger_balance,
        (SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200') - 
        (SELECT COALESCE(SUM(balance), 0) FROM customers) as difference,
        ABS((SELECT COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
         FROM ledger_entries le
         JOIN accounts a ON a."Id" = le."AccountId"
         WHERE a."AccountCode" = '1200') - 
        (SELECT COALESCE(SUM(balance), 0) FROM customers)) < 0.01 as is_balanced;
END;
$$;


--
-- Name: check_credit_sale_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_credit_sale_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.payment_method = 'CREDIT' AND NEW.customer_id IS NULL THEN
        RAISE EXCEPTION 'Credit sales require a customer. Sale: %', NEW.sale_number;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION check_credit_sale_customer(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_credit_sale_customer() IS 'Ensures credit sales have a customer assigned';


--
-- Name: check_expense_approval_required(numeric, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_expense_approval_required(expense_amount numeric, submitter_role character varying) RETURNS TABLE(approval_required boolean, max_amount numeric, requires_additional boolean)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        (expense_amount > al.max_amount) as approval_required,
        al.max_amount,
        al.requires_additional_approval
    FROM approval_limits al
    WHERE al.role = submitter_role 
      AND al.is_active = true
    LIMIT 1;
END;
$$;


--
-- Name: check_inventory_not_negative(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_inventory_not_negative() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.quantity < 0 THEN
        RAISE EXCEPTION 'Inventory quantity cannot be negative. Batch: %, Current: %',
            NEW.id, NEW.quantity;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: check_journal_entry_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_journal_entry_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    total_debits NUMERIC;
    total_credits NUMERIC;
BEGIN
    -- Calculate totals for this journal entry
    SELECT 
        COALESCE(SUM("DebitAmount"), 0),
        COALESCE(SUM("CreditAmount"), 0)
    INTO total_debits, total_credits
    FROM journal_entry_lines
    WHERE "JournalEntryId" = NEW."JournalEntryId";
    
    -- Check if balanced (allow small rounding differences)
    IF ABS(total_debits - total_credits) > 0.01 THEN
        RAISE EXCEPTION 'Journal entry % is not balanced. Debits: %, Credits: %',
            NEW."JournalEntryId", total_debits, total_credits;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION check_journal_entry_balance(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.check_journal_entry_balance() IS 'Ensures journal entries are balanced (debits = credits)';


--
-- Name: check_maintenance_mode(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_maintenance_mode() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM system_maintenance_mode 
        WHERE is_active = TRUE
    ) THEN
        RAISE EXCEPTION 'System is in maintenance mode. Please try again later.';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: expire_old_quotations(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.expire_old_quotations() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE quotations
  SET status = 'EXPIRED'
  WHERE status IN ('DRAFT', 'SENT')
    AND valid_until < CURRENT_DATE;
  
  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;


--
-- Name: FUNCTION expire_old_quotations(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.expire_old_quotations() IS 'Automatically expire quotes past their valid_until date. Should be run daily.';


--
-- Name: fn_check_transaction_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_check_transaction_integrity() RETURNS TABLE(check_name text, issue_count integer, status text, details text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Check 1: Completed sales without GL entries
    SELECT COUNT(*) INTO v_count
    FROM sales s
    LEFT JOIN ledger_transactions lt ON lt."ReferenceType" = 'SALE' AND lt."ReferenceId" = s.id
    WHERE s.status = 'COMPLETED' AND lt."Id" IS NULL;
    
    check_name := 'Ghost Sales (no GL)';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'CRITICAL' END;
    details := CASE WHEN v_count = 0 THEN 'All sales have GL entries' 
               ELSE 'Run: SELECT fn_recover_missing_gl_postings();' END;
    RETURN NEXT;
    
    -- Check 2: Invoice payments (for CREDIT sales) without GL entries
    SELECT COUNT(*) INTO v_count
    FROM invoice_payments ip
    JOIN invoices i ON i."Id" = ip.invoice_id
    LEFT JOIN sales s ON s.id = i."SaleId"
    LEFT JOIN ledger_transactions lt ON lt."ReferenceType" = 'INVOICE_PAYMENT' AND lt."ReferenceId" = ip.id
    WHERE lt."Id" IS NULL
      AND (s.payment_method IS NULL OR s.payment_method != 'CASH');
    
    check_name := 'Ghost Invoice Payments';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'WARNING' END;
    details := CASE WHEN v_count = 0 THEN 'All invoice payments have GL entries' 
               ELSE 'Run: SELECT fn_recover_missing_gl_postings();' END;
    RETURN NEXT;
    
    -- Check 3: Unbalanced ledger transactions
    SELECT COUNT(*) INTO v_count
    FROM ledger_transactions lt
    WHERE lt."TotalDebitAmount" != lt."TotalCreditAmount"
      AND lt."Status" = 'POSTED'
      AND lt."IsReversed" = FALSE;
    
    check_name := 'Unbalanced Transactions';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'CRITICAL' END;
    details := CASE WHEN v_count = 0 THEN 'All transactions balanced' 
               ELSE 'Manual review required' END;
    RETURN NEXT;
    
    -- Check 4: Orphaned ledger entries
    SELECT COUNT(*) INTO v_count
    FROM ledger_entries le
    LEFT JOIN ledger_transactions lt ON lt."Id" = le."LedgerTransactionId"
    WHERE lt."Id" IS NULL;
    
    check_name := 'Orphaned Ledger Entries';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'WARNING' END;
    details := CASE WHEN v_count = 0 THEN 'No orphaned entries' 
               ELSE 'Consider cleanup' END;
    RETURN NEXT;
    
    -- Check 5: Sales with items but no stock movements (non-service items only)
    SELECT COUNT(DISTINCT s.id) INTO v_count
    FROM sales s
    JOIN sale_items si ON si.sale_id = s.id
    LEFT JOIN stock_movements sm ON sm.reference_id = s.id AND sm.reference_type = 'SALE'
    WHERE s.status = 'COMPLETED'
      AND si.is_service = FALSE
      AND sm.id IS NULL;
    
    check_name := 'Sales Missing Stock Movement';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'WARNING' END;
    details := CASE WHEN v_count = 0 THEN 'All sales have stock movements' 
               ELSE 'Check stock_movement triggers' END;
    RETURN NEXT;
    
    -- Check 6: Customer balance mismatches
    SELECT COUNT(*) INTO v_count
    FROM customers c
    WHERE c.balance != (
        SELECT COALESCE(SUM(
            CASE 
                WHEN s.payment_method = 'CREDIT' AND s.status = 'COMPLETED' 
                THEN s.total_amount - COALESCE(s.amount_paid, 0)
                ELSE 0 
            END
        ), 0) - COALESCE((
            SELECT SUM("Amount") FROM customer_payments 
            WHERE "CustomerId" = c.id AND "Status" = 'COMPLETED'
        ), 0)
        FROM sales s WHERE s.customer_id = c.id
    );
    
    check_name := 'Customer Balance Mismatch';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'WARNING' END;
    details := CASE WHEN v_count = 0 THEN 'All customer balances correct' 
               ELSE 'Recalculate customer balances' END;
    RETURN NEXT;
    
    -- Check 7: Supplier balance mismatches
    -- Note: suppliers table uses PascalCase ("OutstandingBalance", "Id")
    -- goods_receipts uses total_value (not total_amount), joins via purchase_orders
    SELECT COUNT(*) INTO v_count
    FROM suppliers sup
    WHERE sup."OutstandingBalance" != (
        SELECT COALESCE(SUM(gr.total_value), 0)
        FROM goods_receipts gr
        JOIN purchase_orders po ON po.id = gr.purchase_order_id
        WHERE po.supplier_id = sup."Id" AND gr.status = 'COMPLETED'
    ) - (
        SELECT COALESCE(SUM("Amount"), 0)
        FROM supplier_payments
        WHERE "SupplierId" = sup."Id" AND "Status" = 'COMPLETED'
    );
    
    check_name := 'Supplier Balance Mismatch';
    issue_count := v_count;
    status := CASE WHEN v_count = 0 THEN 'OK' ELSE 'WARNING' END;
    details := CASE WHEN v_count = 0 THEN 'All supplier balances correct' 
               ELSE 'Recalculate supplier balances' END;
    RETURN NEXT;
END;
$$;


--
-- Name: fn_close_accounting_period(integer, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_close_accounting_period(p_year integer, p_month integer, p_closed_by uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text) RETURNS TABLE(success boolean, message text, period_id uuid)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_period_id UUID;
    v_current_status VARCHAR(20);
    v_period_start DATE;
    v_period_end DATE;
BEGIN
    -- Calculate period boundaries
    v_period_start := MAKE_DATE(p_year, p_month, 1);
    v_period_end := (v_period_start + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
    
    -- Check if period exists
    SELECT id, status INTO v_period_id, v_current_status
    FROM accounting_periods
    WHERE period_year = p_year AND period_month = p_month
    FOR UPDATE; -- Lock the row
    
    -- If period doesn't exist, create it first
    IF v_period_id IS NULL THEN
        INSERT INTO accounting_periods (
            period_year, period_month,
            period_start, period_end,
            status
        ) VALUES (
            p_year, p_month,
            v_period_start, v_period_end,
            'OPEN'
        )
        RETURNING id INTO v_period_id;
        
        v_current_status := 'OPEN';
        
        INSERT INTO accounting_period_history (
            period_id, action, period_year, period_month,
            previous_status, new_status, notes
        ) VALUES (
            v_period_id, 'CREATED', p_year, p_month,
            NULL, 'OPEN', 'Period created for closing'
        );
    END IF;
    
    -- Check if already closed
    IF v_current_status IN ('CLOSED', 'LOCKED') THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s is already %s', p_year, LPAD(p_month::TEXT, 2, '0'), v_current_status),
            v_period_id;
        RETURN;
    END IF;
    
    -- Close the period
    UPDATE accounting_periods
    SET 
        status = 'CLOSED',
        closed_at = NOW(),
        closed_by = p_closed_by,
        close_notes = p_notes,
        updated_at = NOW()
    WHERE id = v_period_id;
    
    -- Record in history
    INSERT INTO accounting_period_history (
        period_id, action, performed_by, period_year, period_month,
        previous_status, new_status, notes
    ) VALUES (
        v_period_id, 'CLOSED', p_closed_by, p_year, p_month,
        'OPEN', 'CLOSED', p_notes
    );
    
    RETURN QUERY SELECT 
        TRUE, 
        FORMAT('Period %s-%s closed successfully', p_year, LPAD(p_month::TEXT, 2, '0')),
        v_period_id;
END;
$$;


--
-- Name: fn_enforce_open_period(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_enforce_open_period() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_transaction_date DATE;
    v_is_open BOOLEAN;
    v_status VARCHAR(20);
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    -- Determine the transaction date based on the table
    CASE TG_TABLE_NAME
        WHEN 'ledger_transactions' THEN
            v_transaction_date := NEW."TransactionDate"::DATE;
        WHEN 'ledger_entries' THEN
            v_transaction_date := COALESCE(NEW."EntryDate"::DATE, NOW()::DATE);
        WHEN 'journal_entries' THEN
            v_transaction_date := NEW.entry_date::DATE;
        WHEN 'sales' THEN
            v_transaction_date := NEW.sale_date::DATE;
        WHEN 'invoice_payments' THEN
            v_transaction_date := NEW.payment_date::DATE;
        WHEN 'customer_payments' THEN
            v_transaction_date := NEW.payment_date::DATE;
        WHEN 'goods_receipts' THEN
            v_transaction_date := NEW.received_date::DATE;
        ELSE
            v_transaction_date := NOW()::DATE;
    END CASE;
    
    -- Check if period is open
    v_year := EXTRACT(YEAR FROM v_transaction_date);
    v_month := EXTRACT(MONTH FROM v_transaction_date);
    
    SELECT status INTO v_status
    FROM accounting_periods
    WHERE period_year = v_year AND period_month = v_month;
    
    -- If no period exists, it's implicitly open
    IF v_status IS NULL THEN
        v_is_open := TRUE;
    ELSE
        v_is_open := (v_status = 'OPEN');
    END IF;
    
    -- Block if period is closed
    IF NOT v_is_open THEN
        RAISE EXCEPTION 'Cannot post to closed period: %-%. Period status: %',
            v_year, LPAD(v_month::TEXT, 2, '0'), v_status
            USING ERRCODE = 'P0001',
                  HINT = 'Create a reversal entry in the current open period instead.';
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_full_reconciliation_report(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_full_reconciliation_report(p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(account_name text, gl_balance numeric, subledger_balance numeric, difference numeric, status text, recommendation text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_cash_gl NUMERIC(18,6);
    v_ar_gl NUMERIC(18,6);
    v_inv_gl NUMERIC(18,6);
    v_ap_gl NUMERIC(18,6);
    v_ar_sub NUMERIC(18,6);
    v_inv_sub NUMERIC(18,6);
    v_ap_sub NUMERIC(18,6);
BEGIN
    -- Cash
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_cash_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    RETURN QUERY SELECT 
        'Cash (1010)'::TEXT,
        v_cash_gl,
        v_cash_gl, -- Cash has no subledger
        0::NUMERIC(18,6),
        'MATCHED'::TEXT,
        'Cash balance verified'::TEXT;
    
    -- AR
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_ar_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ar_sub
    FROM invoices
    WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');
    
    RETURN QUERY SELECT 
        'Accounts Receivable (1200)'::TEXT,
        v_ar_gl,
        v_ar_sub,
        v_ar_gl - v_ar_sub,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ar_gl - v_ar_sub) < 0.01 
            THEN 'AR reconciled successfully'
            ELSE 'Investigate customer invoices and payments'
        END::TEXT;
    
    -- Inventory
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_inv_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
    INTO v_inv_sub
    FROM inventory_batches
    WHERE remaining_quantity > 0;
    
    RETURN QUERY SELECT 
        'Inventory (1300)'::TEXT,
        v_inv_gl,
        v_inv_sub,
        v_inv_gl - v_inv_sub,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_inv_gl - v_inv_sub) < 0.01 
            THEN 'Inventory reconciled successfully'
            ELSE 'Investigate inventory movements and batch valuations'
        END::TEXT;
    
    -- AP
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_ap_gl
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_ap_sub
    FROM suppliers;
    
    RETURN QUERY SELECT 
        'Accounts Payable (2100)'::TEXT,
        v_ap_gl,
        v_ap_sub,
        v_ap_gl - v_ap_sub,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) < 0.01 THEN 'MATCHED' ELSE 'DISCREPANCY' END::TEXT,
        CASE WHEN ABS(v_ap_gl - v_ap_sub) < 0.01 
            THEN 'AP reconciled successfully'
            ELSE 'Investigate supplier invoices and payments'
        END::TEXT;
END;
$$;


--
-- Name: fn_generate_bank_txn_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_bank_txn_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INT;
    v_next_num INT;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_next_num := nextval('bank_txn_number_seq');
    RETURN 'BTX-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$;


--
-- Name: fn_generate_cost_layer_txn_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_cost_layer_txn_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_year VARCHAR(4);
  v_seq INTEGER;
  v_txn_number VARCHAR(50);
BEGIN
  v_year := TO_CHAR(CURRENT_DATE, 'YYYY');
  
  -- Get next sequence number for this year
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(transaction_number FROM 'CLGL-' || v_year || '-(\d+)') AS INTEGER)
  ), 0) + 1
  INTO v_seq
  FROM general_ledger
  WHERE transaction_number LIKE 'CLGL-' || v_year || '-%';
  
  v_txn_number := 'CLGL-' || v_year || '-' || LPAD(v_seq::TEXT, 6, '0');
  
  RETURN v_txn_number;
END;
$$;


--
-- Name: fn_generate_statement_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_generate_statement_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INT;
    v_next_num INT;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(statement_number FROM 10) AS INT)
    ), 0) + 1
    INTO v_next_num
    FROM bank_statements
    WHERE statement_number LIKE 'STM-' || v_year || '-%';
    
    RETURN 'STM-' || v_year || '-' || LPAD(v_next_num::TEXT, 4, '0');
END;
$$;


--
-- Name: fn_get_accounting_periods(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_accounting_periods(p_year integer DEFAULT NULL::integer) RETURNS TABLE(id uuid, period_year integer, period_month integer, period_name text, period_start date, period_end date, status character varying, closed_at timestamp with time zone, closed_by uuid, transaction_count bigint, total_debits numeric, total_credits numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ap.id,
        ap.period_year,
        ap.period_month,
        TO_CHAR(ap.period_start, 'Month YYYY') as period_name,
        ap.period_start,
        ap.period_end,
        ap.status,
        ap.closed_at,
        ap.closed_by,
        COALESCE(stats.txn_count, 0) as transaction_count,
        COALESCE(stats.total_debits, 0) as total_debits,
        COALESCE(stats.total_credits, 0) as total_credits
    FROM accounting_periods ap
    LEFT JOIN LATERAL (
        SELECT 
            COUNT(DISTINCT lt."Id") as txn_count,
            SUM(le."DebitAmount") as total_debits,
            SUM(le."CreditAmount") as total_credits
        FROM ledger_transactions lt
        JOIN ledger_entries le ON le."LedgerTransactionId" = lt."Id"
        WHERE lt."TransactionDate" >= ap.period_start
          AND lt."TransactionDate" < ap.period_end + INTERVAL '1 day'
    ) stats ON TRUE
    WHERE (p_year IS NULL OR ap.period_year = p_year)
    ORDER BY ap.period_year DESC, ap.period_month DESC;
END;
$$;


--
-- Name: fn_get_period_status(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_period_status(check_date date) RETURNS TABLE(period_id uuid, period_year integer, period_month integer, period_start date, period_end date, status character varying, closed_at timestamp with time zone, closed_by uuid)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM check_date);
    v_month := EXTRACT(MONTH FROM check_date);
    
    RETURN QUERY
    SELECT 
        ap.id,
        ap.period_year,
        ap.period_month,
        ap.period_start,
        ap.period_end,
        ap.status,
        ap.closed_at,
        ap.closed_by
    FROM accounting_periods ap
    WHERE ap.period_year = v_year AND ap.period_month = v_month;
    
    -- If no rows returned, the period doesn't exist yet (treated as OPEN)
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT 
            NULL::UUID as period_id,
            v_year as period_year,
            v_month as period_month,
            DATE_TRUNC('month', check_date)::DATE as period_start,
            (DATE_TRUNC('month', check_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE as period_end,
            'OPEN'::VARCHAR(20) as status,
            NULL::TIMESTAMPTZ as closed_at,
            NULL::UUID as closed_by;
    END IF;
END;
$$;


--
-- Name: fn_get_profit_loss(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_profit_loss(p_date_from date, p_date_to date) RETURNS TABLE(section text, account_code character varying, account_name character varying, debit_total numeric, credit_total numeric, net_amount numeric, display_amount numeric, sort_order integer)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    WITH period_entries AS (
        -- Get all ledger entries within the date range
        SELECT 
            le."AccountId",
            le."DebitAmount",
            le."CreditAmount",
            lt."TransactionDate"
        FROM ledger_entries le
        JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
        WHERE lt."TransactionDate"::DATE >= p_date_from
          AND lt."TransactionDate"::DATE <= p_date_to
    ),
    account_totals AS (
        -- Aggregate by account
        SELECT 
            a."Id" as account_id,
            a."AccountCode" as account_code,
            a."AccountName" as account_name,
            a."AccountType" as account_type,
            COALESCE(SUM(pe."DebitAmount"), 0) as debit_total,
            COALESCE(SUM(pe."CreditAmount"), 0) as credit_total
        FROM accounts a
        LEFT JOIN period_entries pe ON pe."AccountId" = a."Id"
        WHERE a."AccountType" IN ('REVENUE', 'EXPENSE')
           OR a."AccountCode" LIKE '5%'  -- COGS accounts
        GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType"
    )
    SELECT 
        CASE 
            WHEN at.account_code LIKE '4%' THEN 'REVENUE'
            WHEN at.account_code LIKE '5%' THEN 'COST_OF_GOODS_SOLD'
            WHEN at.account_code LIKE '6%' OR at.account_type = 'EXPENSE' THEN 'OPERATING_EXPENSES'
            ELSE 'OTHER'
        END as section,
        at.account_code,
        at.account_name,
        at.debit_total,
        at.credit_total,
        at.debit_total - at.credit_total as net_amount,
        -- Display amount: positive for natural direction
        -- Revenue: Credits are positive (so negate)
        -- Expenses/COGS: Debits are positive (keep as-is)
        CASE 
            WHEN at.account_code LIKE '4%' THEN at.credit_total - at.debit_total
            ELSE at.debit_total - at.credit_total
        END as display_amount,
        CASE 
            WHEN at.account_code LIKE '4%' THEN 1
            WHEN at.account_code LIKE '5%' THEN 2
            ELSE 3
        END as sort_order
    FROM account_totals at
    WHERE at.debit_total > 0 OR at.credit_total > 0
    ORDER BY sort_order, at.account_code;
END;
$$;


--
-- Name: fn_get_profit_loss_by_customer(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_profit_loss_by_customer(p_date_from date, p_date_to date) RETURNS TABLE(customer_id uuid, customer_name character varying, total_revenue numeric, total_cogs numeric, gross_profit numeric, gross_margin_percent numeric, transaction_count bigint)
    LANGUAGE plpgsql
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.customer_id,
        COALESCE(c.name, 'Walk-in Customer')::VARCHAR(255) as customer_name,
        SUM(s.total_amount)::NUMERIC(18,6) as total_revenue,
        SUM(s.total_cost)::NUMERIC(18,6) as total_cogs,
        SUM(s.profit)::NUMERIC(18,6) as gross_profit,
        CASE WHEN SUM(s.total_amount) > 0 
            THEN ROUND((SUM(s.profit) / SUM(s.total_amount)) * 100, 4) 
            ELSE 0 
        END::NUMERIC(10,4) as gross_margin_percent,
        COUNT(s.id)::BIGINT as transaction_count
    FROM sales s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.sale_date >= p_date_from
      AND s.sale_date <= p_date_to
      AND s.status = 'COMPLETED'
    GROUP BY s.customer_id, c.name
    HAVING SUM(s.total_amount) > 0 OR SUM(s.total_cost) > 0
    ORDER BY SUM(s.profit) DESC;
END;
$$;


--
-- Name: fn_get_profit_loss_by_product(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_profit_loss_by_product(p_date_from date, p_date_to date) RETURNS TABLE(product_id uuid, product_name character varying, product_sku character varying, total_revenue numeric, total_cogs numeric, gross_profit numeric, gross_margin_percent numeric, quantity_sold numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- For product-level P&L, we need to join with sale_items
    -- since ledger entries don't store product-level detail
    RETURN QUERY
    WITH product_sales AS (
        SELECT 
            si.product_id,
            SUM(si.quantity * si.unit_price) as revenue,
            SUM(si.quantity * COALESCE(si.unit_cost, p.cost_price, 0)) as cogs,
            SUM(si.quantity) as qty_sold
        FROM sale_items si
        JOIN sales s ON si.sale_id = s.id
        JOIN products p ON si.product_id = p.id
        WHERE s.sale_date >= p_date_from
          AND s.sale_date <= p_date_to
          AND s.status = 'COMPLETED'
        GROUP BY si.product_id
    )
    SELECT 
        ps.product_id,
        p.name::VARCHAR(255) as product_name,
        COALESCE(p.sku, p.barcode, '')::VARCHAR(50) as product_sku,
        ps.revenue as total_revenue,
        ps.cogs as total_cogs,
        ps.revenue - ps.cogs as gross_profit,
        CASE WHEN ps.revenue > 0 
            THEN ROUND(((ps.revenue - ps.cogs) / ps.revenue) * 100, 4) 
            ELSE 0 
        END as gross_margin_percent,
        ps.qty_sold as quantity_sold
    FROM product_sales ps
    JOIN products p ON p.id = ps.product_id
    WHERE ps.revenue > 0 OR ps.cogs > 0
    ORDER BY ps.revenue - ps.cogs DESC;
END;
$$;


--
-- Name: fn_get_profit_loss_summary(date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_get_profit_loss_summary(p_date_from date, p_date_to date) RETURNS TABLE(total_revenue numeric, total_cogs numeric, gross_profit numeric, gross_margin_percent numeric, total_operating_expenses numeric, operating_income numeric, operating_margin_percent numeric, net_income numeric, net_margin_percent numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_revenue NUMERIC(18,6) := 0;
    v_cogs NUMERIC(18,6) := 0;
    v_expenses NUMERIC(18,6) := 0;
    v_gross_profit NUMERIC(18,6);
    v_operating_income NUMERIC(18,6);
    v_net_income NUMERIC(18,6);
BEGIN
    -- Calculate revenue (4xxx accounts - credits are positive)
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_revenue
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE lt."TransactionDate"::DATE >= p_date_from
      AND lt."TransactionDate"::DATE <= p_date_to
      AND a."AccountCode" LIKE '4%';
    
    -- Calculate COGS (5xxx accounts - debits are positive)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_cogs
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE lt."TransactionDate"::DATE >= p_date_from
      AND lt."TransactionDate"::DATE <= p_date_to
      AND a."AccountCode" LIKE '5%';
    
    -- Calculate operating expenses (6xxx accounts - debits are positive)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_expenses
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE lt."TransactionDate"::DATE >= p_date_from
      AND lt."TransactionDate"::DATE <= p_date_to
      AND (a."AccountCode" LIKE '6%' OR a."AccountType" = 'EXPENSE');
    
    -- Calculate derived values
    v_gross_profit := v_revenue - v_cogs;
    v_operating_income := v_gross_profit - v_expenses;
    v_net_income := v_operating_income; -- Simplified (no other income/expense)
    
    RETURN QUERY SELECT
        v_revenue as total_revenue,
        v_cogs as total_cogs,
        v_gross_profit as gross_profit,
        CASE WHEN v_revenue > 0 
            THEN ROUND((v_gross_profit / v_revenue) * 100, 4) 
            ELSE 0 
        END as gross_margin_percent,
        v_expenses as total_operating_expenses,
        v_operating_income as operating_income,
        CASE WHEN v_revenue > 0 
            THEN ROUND((v_operating_income / v_revenue) * 100, 4) 
            ELSE 0 
        END as operating_margin_percent,
        v_net_income as net_income,
        CASE WHEN v_revenue > 0 
            THEN ROUND((v_net_income / v_revenue) * 100, 4) 
            ELSE 0 
        END as net_margin_percent;
END;
$$;


--
-- Name: fn_is_period_open(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_is_period_open(check_date date) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INTEGER;
    v_month INTEGER;
    v_status VARCHAR(20);
    v_period_id UUID;
BEGIN
    -- Extract year and month from the date
    v_year := EXTRACT(YEAR FROM check_date);
    v_month := EXTRACT(MONTH FROM check_date);
    
    -- Check if period exists
    SELECT id, status INTO v_period_id, v_status
    FROM accounting_periods
    WHERE period_year = v_year AND period_month = v_month;
    
    -- If period doesn't exist, create it as OPEN
    IF v_period_id IS NULL THEN
        INSERT INTO accounting_periods (
            period_year, period_month,
            period_start, period_end,
            status, created_at
        ) VALUES (
            v_year, v_month,
            DATE_TRUNC('month', check_date)::DATE,
            (DATE_TRUNC('month', check_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE,
            'OPEN', NOW()
        )
        RETURNING id, status INTO v_period_id, v_status;
        
        -- Log the automatic creation
        INSERT INTO accounting_period_history (
            period_id, action, period_year, period_month,
            previous_status, new_status, notes
        ) VALUES (
            v_period_id, 'CREATED', v_year, v_month,
            NULL, 'OPEN', 'Period auto-created on first transaction'
        );
    END IF;
    
    -- Return TRUE only if status is OPEN
    RETURN v_status = 'OPEN';
END;
$$;


--
-- Name: fn_log_stock_movement(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_log_stock_movement() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_movement_type movement_type;  -- Use actual enum type, not TEXT
    v_quantity_change NUMERIC;
    v_reference_type TEXT;
    v_reference_id UUID;
    v_movement_number VARCHAR;  -- Required NOT NULL field
BEGIN
    -- Skip if no actual change in quantity
    IF TG_OP = 'UPDATE' AND NEW.remaining_quantity = OLD.remaining_quantity THEN
        RETURN NEW;
    END IF;
    
    -- Generate movement number (SM-YYYY-######)
    v_movement_number := generate_movement_number();
    
    -- Determine movement type and quantity
    -- movement_type enum values: GOODS_RECEIPT, SALE, ADJUSTMENT_IN, ADJUSTMENT_OUT, TRANSFER_IN, TRANSFER_OUT, RETURN, DAMAGE, EXPIRY
    IF TG_OP = 'INSERT' THEN
        v_movement_type := 'GOODS_RECEIPT'::movement_type;
        v_quantity_change := NEW.remaining_quantity;
        v_reference_type := COALESCE(NEW.source_type, 'GOODS_RECEIPT');
        v_reference_id := NEW.source_id;
    ELSIF TG_OP = 'UPDATE' THEN
        v_quantity_change := NEW.remaining_quantity - OLD.remaining_quantity;
        IF v_quantity_change > 0 THEN
            v_movement_type := 'ADJUSTMENT_IN'::movement_type;
        ELSIF v_quantity_change < 0 THEN
            v_movement_type := 'SALE'::movement_type;
            v_quantity_change := ABS(v_quantity_change);
        ELSE
            RETURN NEW; -- No change, skip logging
        END IF;
        v_reference_type := 'ADJUSTMENT';
        v_reference_id := NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
        v_movement_type := 'DAMAGE'::movement_type;
        v_quantity_change := OLD.remaining_quantity;
        v_reference_type := 'BATCH_DELETE';
        v_reference_id := OLD.id;
    END IF;
    
    -- Insert stock movement record WITH movement_number (required NOT NULL field)
    INSERT INTO stock_movements (
        id, movement_number, product_id, batch_id, movement_type, quantity,
        reference_type, reference_id, created_at
    ) VALUES (
        gen_random_uuid(),
        v_movement_number,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.product_id ELSE NEW.product_id END,
        CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
        v_movement_type,
        v_quantity_change,
        v_reference_type,
        v_reference_id,
        CURRENT_TIMESTAMP
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        -- stock_movements table doesn't exist, skip logging (acceptable)
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    -- FIXED: Removed WHEN OTHERS - only undefined_table is acceptable
END;
$$;


--
-- Name: fn_next_journal_entry_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_next_journal_entry_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
    v_prefix VARCHAR(20) := 'JE-' || v_year || '-';
    v_last_num INTEGER;
    v_next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(
        CAST(NULLIF(SUBSTRING(entry_number FROM LENGTH(v_prefix) + 1), '') AS INTEGER)
    ), 0)
    INTO v_last_num
    FROM manual_journal_entries
    WHERE entry_number LIKE v_prefix || '%';
    
    v_next_num := v_last_num + 1;
    
    RETURN v_prefix || LPAD(v_next_num::TEXT, 4, '0');
END;
$$;


--
-- Name: fn_post_cost_layer_to_gl(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_cost_layer_to_gl() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_txn_id UUID;
  v_total_value NUMERIC(15,2);
  v_inventory_account_id UUID;
  v_offset_account_id UUID;
  v_product_name VARCHAR(255);
  v_txn_number VARCHAR(50);
BEGIN
  v_total_value := NEW.quantity * NEW.unit_cost;
  
  IF NEW.goods_receipt_id IS NULL 
     AND NEW.gl_transaction_id IS NULL 
     AND v_total_value > 0 THEN
    
    SELECT "Id" INTO v_inventory_account_id 
    FROM accounts WHERE "AccountCode" = '1300' AND "IsActive" = true;
    
    SELECT "Id" INTO v_offset_account_id 
    FROM accounts WHERE "AccountCode" = '3200' AND "IsActive" = true;
    
    SELECT name INTO v_product_name 
    FROM products WHERE id = NEW.product_id;
    
    IF v_inventory_account_id IS NOT NULL AND v_offset_account_id IS NOT NULL THEN
      v_txn_id := uuid_generate_v4();
      
      -- Generate transaction number
      SELECT 'CLGL-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || LPAD(
        (COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 'CLGL-\d{4}-(\d+)') AS INTEGER)), 0) + 1)::TEXT, 
        6, '0')
      INTO v_txn_number
      FROM ledger_transactions 
      WHERE "TransactionNumber" LIKE 'CLGL-%';
      
      INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "Description",
        "ReferenceType", "ReferenceId", "TotalDebitAmount", "TotalCreditAmount", "Status", 
        "CreatedAt", "UpdatedAt", "IsReversed"
      ) VALUES (
        v_txn_id,
        v_txn_number,
        CURRENT_DATE,
        'TRIGGER: Cost layer ' || COALESCE(NEW.batch_number, 'N/A') || ' - ' || COALESCE(v_product_name, 'Unknown'),
        'COST_LAYER', 
        NEW.id, 
        v_total_value, 
        v_total_value, 
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        false
      );
      
      INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
      ) VALUES (
        uuid_generate_v4(), 
        v_txn_id, 
        v_inventory_account_id, 
        'DEBIT',
        v_total_value, 
        v_total_value, 
        0,
        'TRIGGER: Cost layer ' || COALESCE(NEW.batch_number, 'N/A'), 
        1, 
        CURRENT_TIMESTAMP
      );
      
      INSERT INTO ledger_entries (
        "Id", "TransactionId", "AccountId", "EntryType", "Amount",
        "DebitAmount", "CreditAmount", "Description", "LineNumber", "CreatedAt"
      ) VALUES (
        uuid_generate_v4(), 
        v_txn_id, 
        v_offset_account_id, 
        'CREDIT',
        v_total_value, 
        0, 
        v_total_value,
        'TRIGGER: Cost layer offset ' || COALESCE(NEW.batch_number, 'N/A'), 
        2, 
        CURRENT_TIMESTAMP
      );
      
      NEW.gl_transaction_id := v_txn_id;
      RAISE NOTICE 'TRIGGER: Posted GL for cost layer (batch: %, value: %)', NEW.batch_number, v_total_value;
    ELSE
      RAISE WARNING 'TRIGGER: Missing accounts (1300 or 3200)';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION fn_post_cost_layer_to_gl(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_post_cost_layer_to_gl() IS 'Failsafe function to auto-post GL entries for orphaned cost layers (no goods_receipt_id).
Transaction format: CLGL-YYYY-NNNNNN. Posts to accounts 1300 (Inventory) and 3200 (Opening Balance Equity).
Created: 2026-01-01';


--
-- Name: fn_post_customer_deposit_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_customer_deposit_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_deposit_account_id UUID;
    v_customer_name TEXT;
    v_existing_transaction UUID;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- IDEMPOTENCY CHECK
        SELECT "Id" INTO v_existing_transaction
        FROM ledger_transactions
        WHERE "ReferenceType" = 'CUSTOMER_DEPOSIT' AND "ReferenceId" = NEW.id
        LIMIT 1;
        
        IF v_existing_transaction IS NOT NULL THEN
            RAISE NOTICE 'Customer deposit % already posted to GL, skipping', NEW.deposit_number;
            RETURN NEW;
        END IF;
        
        -- Get customer name
        SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
        
        -- Get account IDs
        SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
        SELECT "Id" INTO v_deposit_account_id FROM accounts WHERE "AccountCode" = '2200';
        
        IF v_cash_account_id IS NULL OR v_deposit_account_id IS NULL THEN
            RAISE EXCEPTION 'GL accounts not found for deposit posting';
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction with idempotency key
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed", "IdempotencyKey"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'CUSTOMER_DEPOSIT',
            NEW.id,
            NEW.deposit_number,
            'Customer Deposit: ' || COALESCE(v_customer_name, 'Unknown') || ' - ' || NEW.deposit_number,
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE,
            'CUSTOMER_DEPOSIT:' || NEW.id::TEXT
        );
        
        -- DR Cash
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_cash_account_id, 'DEBIT',
            NEW.amount, NEW.amount, 0,
            'Deposit received - ' || NEW.deposit_number,
            1, 'CUSTOMER_DEPOSIT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Customer Deposits (liability)
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_deposit_account_id, 'CREDIT',
            NEW.amount, 0, NEW.amount,
            'Customer deposit liability - ' || NEW.deposit_number,
            2, 'CUSTOMER_DEPOSIT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted customer deposit % to ledger as %', NEW.deposit_number, v_transaction_number;
    END IF;
    
    RETURN NEW;
END;
$_$;


--
-- Name: fn_post_customer_invoice_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_customer_invoice_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ar_account_id UUID;
    v_revenue_account_id UUID;
    v_line_number INTEGER := 0;
    v_already_posted BOOLEAN := FALSE;
BEGIN
    -- Check if GL entry already exists for this invoice (prevent duplicate posting)
    SELECT EXISTS (
        SELECT 1 FROM ledger_entries 
        WHERE "EntityType" = 'INVOICE' 
          AND "EntityId" = NEW."Id"::TEXT
          AND "EntryType" = 'DEBIT'
    ) INTO v_already_posted;
    
    IF v_already_posted THEN
        RAISE NOTICE 'Invoice % already has GL entries, skipping', NEW."InvoiceNumber";
        RETURN NEW;
    END IF;
    
    -- FIXED: Trigger on ANY status change from 'Draft' to an active status
    -- Active statuses: 'Issued', 'Sent', 'Unpaid', 'PartiallyPaid', 'Paid', 'Overdue'
    IF NEW."Status" NOT IN ('Draft', 'Cancelled', 'Void') AND 
       (OLD."Status" IS NULL OR OLD."Status" = 'Draft') THEN
        
        -- Get account IDs
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000';
        
        IF v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'AR account (1200) not found - cannot post invoice GL entry';
        END IF;
        
        IF v_revenue_account_id IS NULL THEN
            -- Try alternative revenue accounts
            SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4100';
            IF v_revenue_account_id IS NULL THEN
                RAISE EXCEPTION 'Revenue account (4000 or 4100) not found - cannot post invoice GL entry';
            END IF;
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
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
            'Customer Invoice: ' || NEW."InvoiceNumber",
            NEW."TotalAmount",
            NEW."TotalAmount",
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Accounts Receivable (for full invoice amount - not amount paid)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'DEBIT',
            NEW."TotalAmount", NEW."TotalAmount", 0, 
            'Invoice ' || NEW."InvoiceNumber" || ' - ' || NEW."CustomerName",
            v_line_number, 'INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Revenue (for full invoice amount)
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
        
        -- Update account balances
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE("CurrentBalance", 0) + NEW."TotalAmount"
        WHERE "Id" = v_ar_account_id;
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE("CurrentBalance", 0) + NEW."TotalAmount"
        WHERE "Id" = v_revenue_account_id;
        
        RAISE NOTICE 'Posted customer invoice % to ledger as % (status: %)', 
                     NEW."InvoiceNumber", v_transaction_number, NEW."Status";
    END IF;
    
    RETURN NEW;
    -- NO EXCEPTION HANDLER - GL failures MUST abort transaction
END;
$_$;


--
-- Name: fn_post_customer_payment_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_customer_payment_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_cash_account_id UUID;
    v_ar_account_id UUID;
    v_customer_name TEXT;
BEGIN
    -- Get account IDs
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    
    -- Get customer name
    SELECT name INTO v_customer_name FROM customers WHERE id = NEW.customer_id;
    
    IF COALESCE(NEW.amount, 0) > 0 THEN
        v_transaction_number := generate_ledger_transaction_number();
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'CUSTOMER_PAYMENT',
            NEW.id,
            NEW.payment_number,
            'Customer Payment: ' || COALESCE(v_customer_name, 'Unknown') || ' - ' || NEW.payment_number,
            COALESCE(NEW.amount, 0),
            COALESCE(NEW.amount, 0),
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Cash
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_cash_account_id,
            'DEBIT',
            COALESCE(NEW.amount, 0),
            COALESCE(NEW.amount, 0),
            0,
            'Payment received - ' || COALESCE(v_customer_name, 'Unknown'),
            1,
            'CUSTOMER_PAYMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_ar_account_id,
            'CREDIT',
            COALESCE(NEW.amount, 0),
            0,
            COALESCE(NEW.amount, 0),
            'AR reduced - ' || COALESCE(v_customer_name, 'Unknown'),
            2,
            'CUSTOMER_PAYMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Account balances are now automatically updated by trg_sync_account_balance triggers
        RAISE NOTICE 'Posted customer payment % to ledger as transaction %', NEW.payment_number, v_transaction_number;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_post_deposit_application_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_deposit_application_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_payment_method TEXT;
BEGIN
    -- Only post on INSERT (new application)
    IF TG_OP = 'INSERT' THEN
        
        -- Check if this sale was paid with DEPOSIT payment method
        -- If so, the sale trigger already handled the GL posting
        SELECT payment_method::TEXT INTO v_sale_payment_method
        FROM sales WHERE id = NEW.sale_id;
        
        IF v_sale_payment_method = 'DEPOSIT' THEN
            -- Skip GL posting - already handled by sale trigger
            RAISE NOTICE 'Skipping deposit application GL for sale % - already posted by sale trigger', NEW.sale_id;
            RETURN NEW;
        END IF;
        
        -- For non-DEPOSIT sales (e.g., applying deposit to a CREDIT sale),
        -- we would need the original logic here. But for now, just return.
        -- This case is complex and rarely used.
        RETURN NEW;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_post_expense_to_gl(uuid, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_expense_to_gl(p_expense_id uuid, p_payment_account_code character varying DEFAULT '1010'::character varying) RETURNS jsonb
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_expense RECORD;
    v_expense_account_id UUID;
    v_payment_account_id UUID;
    v_transaction_id UUID;
    v_transaction_number VARCHAR;
BEGIN
    -- Get expense details
    SELECT e.*, a."AccountCode" AS expense_account_code, a."AccountName" AS expense_account_name
    INTO v_expense
    FROM expenses e
    LEFT JOIN accounts a ON e.account_id = a."Id"
    WHERE e.id = p_expense_id;

    IF v_expense IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Expense not found');
    END IF;

    IF v_expense.status != 'PAID' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only PAID expenses can be posted to GL');
    END IF;

    -- Get account IDs
    v_expense_account_id := v_expense.account_id;
    IF v_expense_account_id IS NULL THEN
        SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
    END IF;

    SELECT "Id" INTO v_payment_account_id FROM accounts WHERE "AccountCode" = p_payment_account_code;
    IF v_payment_account_id IS NULL THEN
        SELECT "Id" INTO v_payment_account_id FROM accounts WHERE "AccountCode" = '1010';
    END IF;

    -- Check for duplicate posting
    IF EXISTS (
        SELECT 1 FROM ledger_transactions 
        WHERE "ReferenceType" = 'EXPENSE' 
        AND "ReferenceId" = p_expense_id
        AND "Status" = 'POSTED'
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Expense already posted to GL');
    END IF;

    -- Generate transaction number
    SELECT 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || 
           LPAD((COALESCE(MAX(SUBSTRING("TransactionNumber" FROM '[0-9]+$')::INT), 0) + 1)::TEXT, 4, '0')
    INTO v_transaction_number
    FROM ledger_transactions
    WHERE "TransactionNumber" LIKE 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%';

    IF v_transaction_number IS NULL THEN
        v_transaction_number := 'JE-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-0001';
    END IF;

    -- Create ledger transaction with all required columns
    INSERT INTO ledger_transactions (
        "TransactionNumber",
        "TransactionDate",
        "Description",
        "ReferenceType",
        "ReferenceId",
        "ReferenceNumber",
        "TotalDebitAmount",
        "TotalCreditAmount",
        "Status",
        "CreatedAt",
        "UpdatedAt",
        "IsReversed",
        "CreatedBy",
        "IdempotencyKey"
    ) VALUES (
        v_transaction_number,
        v_expense.expense_date,
        'Expense: ' || v_expense.title,
        'EXPENSE',
        p_expense_id,
        v_expense.expense_number,
        v_expense.amount,
        v_expense.amount,
        'POSTED',
        NOW(),
        NOW(),
        FALSE,
        '00000000-0000-0000-0000-000000000000',
        'EXPENSE-' || p_expense_id::TEXT
    ) RETURNING "Id" INTO v_transaction_id;

    -- Create debit entry (expense account) with all required columns
    INSERT INTO ledger_entries (
        "TransactionId",
        "AccountId",
        "EntryType",
        "Amount",
        "DebitAmount",
        "CreditAmount",
        "Description",
        "LineNumber",
        "CreatedAt",
        "EntryDate"
    ) VALUES (
        v_transaction_id,
        v_expense_account_id,
        'DEBIT',
        v_expense.amount,
        v_expense.amount,
        0,
        v_expense.category || ': ' || v_expense.title,
        1,
        NOW(),
        v_expense.expense_date
    );

    -- Create credit entry (payment account - usually cash)
    INSERT INTO ledger_entries (
        "TransactionId",
        "AccountId",
        "EntryType",
        "Amount",
        "DebitAmount",
        "CreditAmount",
        "Description",
        "LineNumber",
        "CreatedAt",
        "EntryDate"
    ) VALUES (
        v_transaction_id,
        v_payment_account_id,
        'CREDIT',
        v_expense.amount,
        0,
        v_expense.amount,
        'Payment for ' || v_expense.expense_number,
        2,
        NOW(),
        v_expense.expense_date
    );

    RETURN jsonb_build_object(
        'success', true,
        'transactionId', v_transaction_id,
        'transactionNumber', v_transaction_number,
        'expenseNumber', v_expense.expense_number,
        'amount', v_expense.amount,
        'debitAccount', v_expense.expense_account_code,
        'creditAccount', p_payment_account_code
    );
END;
$_$;


--
-- Name: fn_post_expense_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_expense_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_expense_account_id UUID;
    v_cash_account_id UUID;
    v_ap_account_id UUID;
    v_credit_account_id UUID;
BEGIN
    -- Get default accounts
    SELECT "Id" INTO v_cash_account_id FROM accounts WHERE "AccountCode" = '1010';
    SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';

    -- ================================================================
    -- PHASE 1: APPROVAL - Post expense recognition
    -- When status changes to APPROVED, recognize the expense
    -- ================================================================
    IF NEW.status = 'APPROVED' AND (OLD.status IS NULL OR OLD.status != 'APPROVED') THEN

        -- Prevent duplicate postings
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'EXPENSE' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Expense % already posted to ledger - skipping approval posting', NEW.expense_number;
        ELSE
            -- Get expense account (DEBIT side) from expense category mapping
            IF NEW.category_id IS NOT NULL THEN
                SELECT ec.account_id INTO v_expense_account_id
                FROM expense_categories ec
                WHERE ec.id = NEW.category_id AND ec.account_id IS NOT NULL;
            END IF;

            -- Fallback to default expense account if no category mapping
            IF v_expense_account_id IS NULL THEN
                SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '6900';
            END IF;

            -- Determine credit account based on payment status at approval time
            IF NEW.payment_status = 'PAID' THEN
                -- Already paid at creation - credit cash/bank directly
                IF NEW.payment_account_id IS NOT NULL THEN
                    v_credit_account_id := NEW.payment_account_id;
                ELSE
                    v_credit_account_id := v_cash_account_id;
                END IF;
            ELSE
                -- Unpaid at approval - credit Accounts Payable
                v_credit_account_id := v_ap_account_id;
            END IF;

            IF COALESCE(NEW.amount, 0) > 0 THEN
                v_transaction_number := generate_ledger_transaction_number();
                v_transaction_id := gen_random_uuid();

                -- Create ledger transaction
                INSERT INTO ledger_transactions (
                    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                    "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                    "Status", "CreatedAt", "UpdatedAt", "IsReversed"
                ) VALUES (
                    v_transaction_id,
                    v_transaction_number,
                    COALESCE(NEW.expense_date, CURRENT_DATE),
                    'EXPENSE',
                    NEW.id,
                    NEW.expense_number,
                    'Expense: ' || COALESCE(NEW.title, NEW.expense_number),
                    COALESCE(NEW.amount, 0),
                    COALESCE(NEW.amount, 0),
                    'POSTED',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    FALSE
                );

                -- DEBIT: Expense account (increases expense)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_expense_account_id,
                    COALESCE(NEW.amount, 0), 0,
                    'Expense: ' || COALESCE(NEW.title, NEW.expense_number),
                    'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                -- CREDIT: Cash/Bank (if paid) or AP (if unpaid)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                    0, COALESCE(NEW.amount, 0),
                    'Expense recognition: ' || NEW.expense_number,
                    'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                RAISE NOTICE 'Posted expense % approval to ledger (Debit: %, Credit: %)', 
                    NEW.expense_number, v_expense_account_id, v_credit_account_id;
            END IF;
        END IF;
    END IF;

    -- ================================================================
    -- PHASE 2: PAYMENT - Clear AP when expense is marked as paid
    -- When payment_status changes to PAID on an already-approved expense
    -- Post: DR Accounts Payable, CR Cash/Bank
    -- ================================================================
    IF NEW.status = 'APPROVED' AND OLD.status = 'APPROVED' 
       AND NEW.payment_status = 'PAID' 
       AND (OLD.payment_status IS NULL OR OLD.payment_status != 'PAID') THEN

        -- Prevent duplicate payment postings
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'EXPENSE_PAYMENT' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Expense payment % already posted to ledger - skipping', NEW.expense_number;
        ELSE
            -- Determine which cash/bank account to credit
            IF NEW.payment_account_id IS NOT NULL THEN
                v_credit_account_id := NEW.payment_account_id;
            ELSE
                v_credit_account_id := v_cash_account_id;
            END IF;

            IF COALESCE(NEW.amount, 0) > 0 THEN
                v_transaction_number := generate_ledger_transaction_number();
                v_transaction_id := gen_random_uuid();

                -- Create ledger transaction for payment
                INSERT INTO ledger_transactions (
                    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                    "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                    "Status", "CreatedAt", "UpdatedAt", "IsReversed"
                ) VALUES (
                    v_transaction_id,
                    v_transaction_number,
                    CURRENT_DATE,
                    'EXPENSE_PAYMENT',
                    NEW.id,
                    NEW.expense_number,
                    'Payment for expense: ' || COALESCE(NEW.title, NEW.expense_number),
                    COALESCE(NEW.amount, 0),
                    COALESCE(NEW.amount, 0),
                    'POSTED',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    FALSE
                );

                -- DEBIT: Accounts Payable (clear the liability)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_ap_account_id,
                    COALESCE(NEW.amount, 0), 0,
                    'Clear AP for expense: ' || NEW.expense_number,
                    'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                -- CREDIT: Cash/Bank (reduce cash)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                    0, COALESCE(NEW.amount, 0),
                    'Payment for expense: ' || NEW.expense_number,
                    'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                RAISE NOTICE 'Posted expense payment % to ledger (Debit AP: %, Credit Cash: %)', 
                    NEW.expense_number, v_ap_account_id, v_credit_account_id;
            END IF;
        END IF;
    END IF;

    -- ================================================================
    -- PHASE 2 ALT: When status changes to PAID (via markExpensePaid)
    -- This handles the legacy flow where status goes APPROVED -> PAID
    -- ================================================================
    IF NEW.status = 'PAID' AND OLD.status = 'APPROVED' THEN
        -- Update payment_status to PAID if not already
        -- (This is handled by the service, but we check here as backup)
        
        -- Check if payment GL entry already exists
        IF NOT EXISTS (SELECT 1 FROM ledger_transactions 
                       WHERE "ReferenceType" = 'EXPENSE_PAYMENT' AND "ReferenceId" = NEW.id) THEN
            
            -- Determine which cash/bank account to credit
            IF NEW.payment_account_id IS NOT NULL THEN
                v_credit_account_id := NEW.payment_account_id;
            ELSE
                v_credit_account_id := v_cash_account_id;
            END IF;

            IF COALESCE(NEW.amount, 0) > 0 THEN
                v_transaction_number := generate_ledger_transaction_number();
                v_transaction_id := gen_random_uuid();

                -- Create ledger transaction for payment
                INSERT INTO ledger_transactions (
                    "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                    "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                    "Status", "CreatedAt", "UpdatedAt", "IsReversed"
                ) VALUES (
                    v_transaction_id,
                    v_transaction_number,
                    CURRENT_DATE,
                    'EXPENSE_PAYMENT',
                    NEW.id,
                    NEW.expense_number,
                    'Payment for expense: ' || COALESCE(NEW.title, NEW.expense_number),
                    COALESCE(NEW.amount, 0),
                    COALESCE(NEW.amount, 0),
                    'POSTED',
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP,
                    FALSE
                );

                -- DEBIT: Accounts Payable (clear the liability)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 1, v_ap_account_id,
                    COALESCE(NEW.amount, 0), 0,
                    'Clear AP for expense: ' || NEW.expense_number,
                    'DEBIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                -- CREDIT: Cash/Bank (reduce cash)
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId",
                    "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(), v_transaction_id, v_transaction_id, 2, v_credit_account_id,
                    0, COALESCE(NEW.amount, 0),
                    'Payment for expense: ' || NEW.expense_number,
                    'CREDIT', COALESCE(NEW.amount, 0), CURRENT_TIMESTAMP
                );

                RAISE NOTICE 'Posted expense payment % to ledger via status change (Debit AP: %, Credit Cash: %)', 
                    NEW.expense_number, v_ap_account_id, v_credit_account_id;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_post_goods_receipt_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_goods_receipt_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number VARCHAR(50);
    v_inventory_account_id UUID;
    v_ap_account_id UUID;
    v_total_value NUMERIC(18,6);
    v_description TEXT;
    v_po_number VARCHAR(50);
BEGIN
    -- Only post when status changes to COMPLETED
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        
        -- Get total value from the goods receipt
        v_total_value := COALESCE(NEW.total_value, 0);
        
        -- Skip if no value
        IF v_total_value <= 0 THEN
            RAISE NOTICE 'Skipping GL posting for GR %: zero value', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- Get the Inventory account (1300)
        SELECT "Id" INTO v_inventory_account_id
        FROM accounts
        WHERE "AccountCode" = '1300' AND "IsActive" = true;
        
        IF v_inventory_account_id IS NULL THEN
            RAISE EXCEPTION 'Inventory account (1300) not found';
        END IF;
        
        -- Get the Accounts Payable account (2100)
        SELECT "Id" INTO v_ap_account_id
        FROM accounts
        WHERE "AccountCode" = '2100' AND "IsActive" = true;
        
        IF v_ap_account_id IS NULL THEN
            RAISE EXCEPTION 'Accounts Payable account (2100) not found';
        END IF;
        
        -- Get PO number if available
        SELECT po.order_number INTO v_po_number
        FROM purchase_orders po
        WHERE po.id = NEW.purchase_order_id;
        
        -- Build description
        v_description := 'Goods Receipt: ' || NEW.receipt_number;
        IF v_po_number IS NOT NULL THEN
            v_description := v_description || ' (PO: ' || v_po_number || ')';
        END IF;
        
        -- Generate transaction number
        SELECT 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
               LPAD((COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM 9) AS INTEGER)), 0) + 1)::TEXT, 6, '0')
        INTO v_transaction_number
        FROM ledger_transactions
        WHERE "TransactionNumber" LIKE 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-%';
        
        -- Create ledger transaction (with all required NOT NULL columns)
        INSERT INTO ledger_transactions (
            "Id",
            "TransactionNumber",
            "TransactionDate",
            "Description",
            "ReferenceType",
            "ReferenceId",
            "ReferenceNumber",
            "TotalDebitAmount",
            "TotalCreditAmount",
            "Status",
            "CreatedAt",
            "UpdatedAt",
            "IsReversed",
            "CreatedById"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_number,
            CURRENT_TIMESTAMP,
            v_description,
            'GOODS_RECEIPT',
            NEW.id,
            NEW.receipt_number,
            v_total_value,
            v_total_value,
            'POSTED',
            NOW(),
            NOW(),
            false,
            NEW.received_by_id
        )
        RETURNING "Id" INTO v_transaction_id;
        
        -- DEBIT: Inventory (1300) - Asset increases
        INSERT INTO ledger_entries (
            "Id",
            "TransactionId",
            "AccountId",
            "EntryType",
            "Amount",
            "DebitAmount",
            "CreditAmount",
            "Description",
            "LineNumber",
            "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_inventory_account_id,
            'DEBIT',
            v_total_value,
            v_total_value,
            0,
            v_description,
            1,
            NOW()
        );
        
        -- CREDIT: Accounts Payable (2100) - Liability increases
        INSERT INTO ledger_entries (
            "Id",
            "TransactionId",
            "AccountId",
            "EntryType",
            "Amount",
            "DebitAmount",
            "CreditAmount",
            "Description",
            "LineNumber",
            "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_ap_account_id,
            'CREDIT',
            v_total_value,
            0,
            v_total_value,
            v_description,
            2,
            NOW()
        );
        
        -- Update account balances
        -- Inventory is DEBIT normal - increase balance
        UPDATE accounts
        SET "CurrentBalance" = "CurrentBalance" + v_total_value
        WHERE "Id" = v_inventory_account_id;
        
        -- AP is CREDIT normal - increase balance (stored as positive)
        UPDATE accounts
        SET "CurrentBalance" = "CurrentBalance" + v_total_value
        WHERE "Id" = v_ap_account_id;
        
        RAISE NOTICE 'Posted GL entry for Goods Receipt %: value = %', NEW.receipt_number, v_total_value;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_post_invoice_payment_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_invoice_payment_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_ar_account_id UUID;
    v_invoice_number TEXT;
    v_sale_payment_method TEXT;
    v_invoice_has_ar_entry BOOLEAN;
    v_line_number INTEGER := 0;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Get invoice details and check if this is linked to a sale
        SELECT i."InvoiceNumber", s.payment_method 
        INTO v_invoice_number, v_sale_payment_method
        FROM invoices i 
        LEFT JOIN sales s ON s.id = i."SaleId"
        WHERE i."Id" = NEW.invoice_id;
        
        -- Check if invoice has AR debit entries (meaning invoice was posted to AR)
        SELECT EXISTS (
            SELECT 1 FROM ledger_entries le 
            JOIN accounts a ON a."Id" = le."AccountId"
            WHERE le."EntityId" = NEW.invoice_id::TEXT
              AND le."EntityType" = 'INVOICE'
              AND a."AccountCode" = '1200'
              AND le."DebitAmount" > 0
        ) INTO v_invoice_has_ar_entry;
        
        -- FIXED: Only skip if CASH sale AND invoice does NOT have AR entry
        -- If invoice has AR entry, we MUST post the payment to clear it
        IF v_sale_payment_method = 'CASH' AND NOT v_invoice_has_ar_entry THEN
            RAISE NOTICE 'Invoice payment % for CASH sale without AR entry - skipping GL', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- IDEMPOTENCY CHECK: Skip if already posted
        IF EXISTS (SELECT 1 FROM ledger_transactions 
                   WHERE "ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = NEW.id) THEN
            RAISE NOTICE 'Invoice payment % already posted to GL - skipping', NEW.receipt_number;
            RETURN NEW;
        END IF;
        
        -- Get account IDs based on payment method
        CASE NEW.payment_method
            WHEN 'CASH' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
                IF v_debit_account_id IS NULL THEN
                    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1000';
                END IF;
            WHEN 'BANK_TRANSFER' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
            WHEN 'CHECK' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
            WHEN 'CARD' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
            WHEN 'MOBILE_MONEY' THEN 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
                IF v_debit_account_id IS NULL THEN
                    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1000';
                END IF;
            ELSE 
                SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
                IF v_debit_account_id IS NULL THEN
                    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1000';
                END IF;
        END CASE;
        
        SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
        
        IF v_debit_account_id IS NULL THEN
            RAISE EXCEPTION 'Cash/Bank account not found for invoice payment GL posting';
        END IF;
        
        IF v_ar_account_id IS NULL THEN
            RAISE EXCEPTION 'AR account (1200) not found for invoice payment GL posting';
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
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
            'Invoice Payment: ' || NEW.receipt_number || ' for ' || v_invoice_number,
            NEW.amount,
            NEW.amount,
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Cash/Bank
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_debit_account_id, 'DEBIT',
            NEW.amount, NEW.amount, 0,
            'Cash received - ' || NEW.receipt_number,
            v_line_number, 'INVOICE_PAYMENT', NEW.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        -- CR Accounts Receivable
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
    -- NO EXCEPTION HANDLER - GL failures MUST abort transaction
END;
$_$;


--
-- Name: FUNCTION fn_post_invoice_payment_to_ledger(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_post_invoice_payment_to_ledger() IS 'Posts invoice payments to GL. Skips posting for CASH/CARD/MOBILE_MONEY sales 
since the sale posting already handled Cashâ†’Revenue. Only posts for CREDIT sales 
where payment happens after the sale (Cashâ†’AR).';


--
-- Name: fn_post_invoice_payment_to_ledger_manual(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_invoice_payment_to_ledger_manual(p_payment_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_payment RECORD;
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_ar_account_id UUID;
    v_invoice_number TEXT;
    v_line_number INTEGER := 0;
BEGIN
    -- Get payment details
    SELECT ip.*, i."InvoiceNumber"
    INTO v_payment
    FROM invoice_payments ip
    JOIN invoices i ON i."Id" = ip.invoice_id
    WHERE ip.id = p_payment_id;
    
    IF v_payment IS NULL THEN
        RAISE EXCEPTION 'Invoice payment % not found', p_payment_id;
    END IF;
    
    -- Skip if already posted
    IF EXISTS (SELECT 1 FROM ledger_transactions 
               WHERE "ReferenceType" = 'INVOICE_PAYMENT' AND "ReferenceId" = p_payment_id) THEN
        RAISE NOTICE 'Invoice payment % already posted', p_payment_id;
        RETURN;
    END IF;
    
    -- Get account IDs
    CASE v_payment.payment_method
        WHEN 'CASH' THEN 
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
        WHEN 'BANK_TRANSFER' THEN 
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
        WHEN 'CHECK' THEN 
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
        WHEN 'CARD' THEN 
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1030';
        ELSE 
            SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010';
    END CASE;
    
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    
    v_transaction_number := generate_ledger_transaction_number();
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
        v_payment.id,
        v_payment.receipt_number,
        'Invoice Payment: ' || v_payment.receipt_number || ' for ' || v_payment."InvoiceNumber",
        v_payment.amount,
        v_payment.amount,
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        FALSE
    );
    
    -- DR: Cash/Bank
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
        "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
        "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
    ) VALUES (
        gen_random_uuid(), v_transaction_id, v_transaction_id, v_debit_account_id, 'DEBIT',
        v_payment.amount, v_payment.amount, 0,
        'Payment received - ' || v_payment.receipt_number,
        1, 'INVOICE_PAYMENT', v_payment.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
    );
    
    -- CR: AR
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
        "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
        "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
    ) VALUES (
        gen_random_uuid(), v_transaction_id, v_transaction_id, v_ar_account_id, 'CREDIT',
        v_payment.amount, 0, v_payment.amount,
        'AR reduced - ' || v_payment.receipt_number,
        2, 'INVOICE_PAYMENT', v_payment.id::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
    );
    
    RAISE NOTICE 'Manually posted invoice payment % to GL', v_payment.receipt_number;
END;
$$;


--
-- Name: fn_post_sale_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_sale_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_debit_account_id UUID;
    v_revenue_account_id UUID;
    v_service_revenue_account_id UUID;
    v_cogs_account_id UUID;
    v_inventory_account_id UUID;
    v_line_number INTEGER := 0;
    v_inventory_revenue NUMERIC := 0;
    v_service_revenue NUMERIC := 0;
    v_inventory_cost NUMERIC := 0;
    v_sale_items_count INTEGER := 0;
BEGIN
    -- Only post if status is COMPLETED
    IF NEW.status != 'COMPLETED' THEN
        RETURN NEW;
    END IF;
    
    -- **FIX: Check if sale_items exist - don't post without items**
    SELECT COUNT(*) INTO v_sale_items_count FROM sale_items WHERE sale_id = NEW.id;
    
    IF v_sale_items_count = 0 THEN
        RAISE NOTICE 'Sale % has no items yet - skipping GL posting until items are added', NEW.sale_number;
        RETURN NEW;
    END IF;
    
    -- Prevent duplicate postings using idempotency check
    IF EXISTS (SELECT 1 FROM ledger_transactions 
               WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id) THEN
        RAISE NOTICE 'Sale % already posted to ledger - skipping duplicate', NEW.sale_number;
        RETURN NEW;
    END IF;
    
    -- Get account IDs
    SELECT "Id" INTO v_debit_account_id FROM accounts WHERE "AccountCode" = '1010'; -- Cash
    SELECT "Id" INTO v_revenue_account_id FROM accounts WHERE "AccountCode" = '4000'; -- Sales Revenue (inventory)
    SELECT "Id" INTO v_service_revenue_account_id FROM accounts WHERE "AccountCode" = '4100'; -- Service Revenue
    SELECT "Id" INTO v_cogs_account_id FROM accounts WHERE "AccountCode" = '5000'; -- COGS
    SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300'; -- Inventory
    
    IF v_debit_account_id IS NULL OR v_revenue_account_id IS NULL OR v_service_revenue_account_id IS NULL THEN
        RAISE EXCEPTION 'Required GL accounts not found (1010, 4000, 4100)';
    END IF;
    
    -- CALCULATE REVENUE AND COST SPLIT BY PRODUCT TYPE
    SELECT 
        COALESCE(SUM(CASE WHEN is_service = false THEN total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN is_service = true THEN total_price ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN is_service = false THEN unit_cost * quantity ELSE 0 END), 0)
    INTO v_inventory_revenue, v_service_revenue, v_inventory_cost
    FROM sale_items
    WHERE sale_id = NEW.id;
    
    RAISE NOTICE 'Posted sale % to ledger: inventory_rev=%, service_rev=%, cogs=%', 
        NEW.sale_number, v_inventory_revenue, v_service_revenue, v_inventory_cost;
    
    -- Generate transaction number
    v_transaction_number := generate_ledger_transaction_number();
    v_transaction_id := gen_random_uuid();
    
    -- Create ledger transaction
    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
        "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
        "Status", "CreatedAt", "UpdatedAt", "IsReversed"
    ) VALUES (
        v_transaction_id,
        v_transaction_number,
        COALESCE(NEW.sale_date, CURRENT_DATE),
        'SALE',
        NEW.id,
        NEW.sale_number,
        'Sale: ' || NEW.sale_number,
        COALESCE(NEW.total_amount, 0) + v_inventory_cost,
        COALESCE(NEW.total_amount, 0) + v_inventory_cost,
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        FALSE
    );
    
    -- DEBIT: Cash/AR (depending on payment method)
    v_line_number := v_line_number + 1;
    INSERT INTO ledger_entries (
        "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
        "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
    ) VALUES (
        gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_debit_account_id,
        COALESCE(NEW.total_amount, 0), 0,
        'Cash received from sale ' || NEW.sale_number,
        'DEBIT', COALESCE(NEW.total_amount, 0), CURRENT_TIMESTAMP
    );
    
    -- CREDIT: Sales Revenue (Inventory items only) - Account 4000
    IF v_inventory_revenue > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_revenue_account_id,
            0, v_inventory_revenue,
            'Revenue from inventory sale ' || NEW.sale_number,
            'CREDIT', v_inventory_revenue, CURRENT_TIMESTAMP
        );
    END IF;
    
    -- CREDIT: Service Revenue (Service items only) - Account 4100
    IF v_service_revenue > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_service_revenue_account_id,
            0, v_service_revenue,
            'Revenue from service sale ' || NEW.sale_number,
            'CREDIT', v_service_revenue, CURRENT_TIMESTAMP
        );
    END IF;
    
    -- DEBIT: COGS (Inventory items only, NOT service items)
    -- CREDIT: Inventory (Inventory items only, NOT service items)
    IF v_inventory_cost > 0 THEN
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_cogs_account_id,
            v_inventory_cost, 0,
            'Cost of goods sold - ' || NEW.sale_number,
            'DEBIT', v_inventory_cost, CURRENT_TIMESTAMP
        );
        
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "LineNumber", "AccountId", 
            "DebitAmount", "CreditAmount", "Description", "EntryType", "Amount", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_line_number, v_inventory_account_id,
            0, v_inventory_cost,
            'Inventory reduction - ' || NEW.sale_number,
            'CREDIT', v_inventory_cost, CURRENT_TIMESTAMP
        );
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: FUNCTION fn_post_sale_to_ledger(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_post_sale_to_ledger() IS 'Posts sales to general ledger with revenue split: inventory items â†’ 4000, service items â†’ 4100. COGS entries exclude service items.';


--
-- Name: fn_post_sale_void_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_sale_void_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_original_transaction_id UUID;
    v_reversal_transaction_id UUID;
    v_transaction_number TEXT;
    v_entry RECORD;
    v_line_number INTEGER := 0;
BEGIN
    -- Only trigger when voided_at is set
    IF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
        
        -- Find original ledger transaction
        SELECT "Id" INTO v_original_transaction_id
        FROM ledger_transactions
        WHERE "ReferenceType" = 'SALE' AND "ReferenceId" = NEW.id AND "IsReversed" = FALSE
        LIMIT 1;
        
        IF v_original_transaction_id IS NOT NULL THEN
            -- Generate reversal transaction
            v_transaction_number := generate_ledger_transaction_number();
            v_reversal_transaction_id := gen_random_uuid();
            
            -- Create reversal ledger transaction
            INSERT INTO ledger_transactions (
                "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
                "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
                "Status", "CreatedAt", "UpdatedAt", "IsReversed", "OriginalTransactionId"
            ) VALUES (
                v_reversal_transaction_id,
                v_transaction_number,
                CURRENT_TIMESTAMP,
                'SALE_VOID',
                NEW.id,
                NEW.sale_number,
                'VOID: Sale ' || NEW.sale_number || ' - ' || COALESCE(NEW.void_reason, 'No reason'),
                COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
                COALESCE(NEW.total_amount, 0) + COALESCE(NEW.total_cost, 0),
                'POSTED',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                FALSE,
                v_original_transaction_id
            );
            
            -- Reverse each original entry (swap debits and credits)
            FOR v_entry IN 
                SELECT * FROM ledger_entries WHERE "LedgerTransactionId" = v_original_transaction_id
            LOOP
                v_line_number := v_line_number + 1;
                INSERT INTO ledger_entries (
                    "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
                    "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
                    "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
                ) VALUES (
                    gen_random_uuid(),
                    v_reversal_transaction_id,
                    v_reversal_transaction_id,
                    v_entry."AccountId",
                    CASE WHEN v_entry."EntryType" = 'DEBIT' THEN 'CREDIT' ELSE 'DEBIT' END,
                    v_entry."Amount",
                    v_entry."CreditAmount", -- Swap
                    v_entry."DebitAmount",  -- Swap
                    'REVERSAL: ' || v_entry."Description",
                    v_line_number,
                    v_entry."EntityType",
                    v_entry."EntityId",
                    CURRENT_TIMESTAMP,
                    0,
                    CURRENT_TIMESTAMP
                );
                -- Account balances are automatically updated by trg_sync_account_balance triggers
            END LOOP;
            
            -- Mark original transaction as reversed
            UPDATE ledger_transactions 
            SET "IsReversed" = TRUE, "ReversalTransactionId" = v_reversal_transaction_id, "ReversedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_original_transaction_id;
            
            RAISE NOTICE 'Posted void reversal for sale % as transaction %', NEW.sale_number, v_transaction_number;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_post_stock_movement_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_stock_movement_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_inventory_account_id UUID;
    v_adjustment_account_id UUID;
    v_line_number INTEGER := 0;
    v_product_name TEXT;
    v_movement_value NUMERIC;
    v_description TEXT;
BEGIN
    -- Only post for adjustment-type movements (not SALE or GOODS_RECEIPT - those have their own triggers)
    IF NEW.movement_type NOT IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY') THEN
        RETURN NEW;
    END IF;
    
    -- Calculate movement value
    v_movement_value := COALESCE(NEW.quantity * COALESCE(NEW.unit_cost, 0), 0);
    
    -- Skip if no value (avoid zero-value entries)
    IF v_movement_value <= 0 THEN
        RAISE WARNING 'Skipping GL posting for stock movement % - zero or negative value', NEW.movement_number;
        RETURN NEW;
    END IF;
    
    -- Get product name for description
    SELECT name INTO v_product_name FROM products WHERE id = NEW.product_id;
    v_description := 'Stock ' || NEW.movement_type || ': ' || COALESCE(v_product_name, 'Unknown') || ' - ' || NEW.movement_number;
    
    -- Get account IDs
    SELECT "Id" INTO v_inventory_account_id FROM accounts WHERE "AccountCode" = '1300';
    
    IF v_inventory_account_id IS NULL THEN
        RAISE EXCEPTION 'Inventory account 1300 not found - cannot post stock movement';
    END IF;
    
    -- Determine which adjustment account to use based on movement type
    CASE NEW.movement_type
        WHEN 'ADJUSTMENT_OUT' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5110'; -- Shrinkage
        WHEN 'DAMAGE' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5120'; -- Damage
        WHEN 'EXPIRY' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5130'; -- Expiry
        WHEN 'ADJUSTMENT_IN' THEN
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '4110'; -- Overage
        ELSE
            SELECT "Id" INTO v_adjustment_account_id FROM accounts WHERE "AccountCode" = '5110'; -- Default to shrinkage
    END CASE;
    
    IF v_adjustment_account_id IS NULL THEN
        RAISE WARNING 'Adjustment account not found for movement type % - skipping GL posting', NEW.movement_type;
        RETURN NEW;
    END IF;
    
    -- Generate transaction number
    v_transaction_number := COALESCE(
        (SELECT generate_ledger_transaction_number()),
        'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
        LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
              FROM ledger_transactions)::TEXT, 6, '0')
    );
    v_transaction_id := gen_random_uuid();
    
    -- Create ledger transaction
    INSERT INTO ledger_transactions (
        "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
        "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
        "Status", "CreatedAt", "UpdatedAt", "IsReversed"
    ) VALUES (
        v_transaction_id,
        v_transaction_number,
        CURRENT_TIMESTAMP,
        'STOCK_MOVEMENT',
        NEW.id,
        NEW.movement_number,
        v_description,
        v_movement_value,
        v_movement_value,
        'POSTED',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        FALSE
    );
    
    -- Post entries based on movement type
    IF NEW.movement_type IN ('ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY') THEN
        -- SHRINKAGE/LOSS: DR Expense, CR Inventory
        
        -- Entry 1: DR Expense (Shrinkage/Damage/Expiry)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_adjustment_account_id,
            'DEBIT',
            v_movement_value,
            v_movement_value,
            0,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update expense account balance (debit increases expense)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" + v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_adjustment_account_id;
        
        -- Entry 2: CR Inventory (reduce asset)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_inventory_account_id,
            'CREDIT',
            v_movement_value,
            0,
            v_movement_value,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update inventory account balance (credit decreases asset)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" - v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_inventory_account_id;
        
    ELSIF NEW.movement_type = 'ADJUSTMENT_IN' THEN
        -- OVERAGE/GAIN: DR Inventory, CR Revenue
        
        -- Entry 1: DR Inventory (increase asset)
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_inventory_account_id,
            'DEBIT',
            v_movement_value,
            v_movement_value,
            0,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update inventory account balance (debit increases asset)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" + v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_inventory_account_id;
        
        -- Entry 2: CR Overage Revenue
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_adjustment_account_id,
            'CREDIT',
            v_movement_value,
            0,
            v_movement_value,
            v_description,
            v_line_number,
            'STOCK_MOVEMENT',
            NEW.id::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Update overage account balance (credit increases revenue)
        UPDATE accounts 
        SET "CurrentBalance" = "CurrentBalance" + v_movement_value,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_adjustment_account_id;
    END IF;
    
    RAISE NOTICE 'Posted GL entry for stock movement %: % = %', NEW.movement_number, NEW.movement_type, v_movement_value;
    
    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Failed to post stock movement to GL: % - %', SQLERRM, NEW.movement_number;
        RETURN NEW; -- Don't fail the movement, just log warning
END;
$_$;


--
-- Name: fn_post_supplier_invoice_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_supplier_invoice_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_ap_account_id UUID;
    v_expense_account_id UUID;
    v_line_number INTEGER := 0;
    v_supplier_name TEXT;
BEGIN
    -- Only trigger on status change to 'Received' or 'Approved'
    IF NEW."Status" IN ('Received', 'Approved') AND (OLD."Status" IS NULL OR OLD."Status" = 'Draft') THEN
        
        -- Get supplier name
        SELECT "Name" INTO v_supplier_name FROM suppliers WHERE "Id" = NEW."SupplierId";
        
        -- Get account IDs
        SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2000';
        SELECT "Id" INTO v_expense_account_id FROM accounts WHERE "AccountCode" = '5100';
        
        IF v_ap_account_id IS NULL THEN
            RAISE WARNING 'AP account not found for supplier invoice posting';
            RETURN NEW;
        END IF;
        
        -- Generate transaction number
        v_transaction_number := 'LT-' || TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                                LPAD((SELECT COALESCE(MAX(CAST(SUBSTRING("TransactionNumber" FROM '[0-9]+$') AS INTEGER)), 0) + 1 
                                      FROM ledger_transactions)::TEXT, 6, '0');
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
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
        
        -- DR Expense/Inventory (simplified - using general expense account)
        IF v_expense_account_id IS NOT NULL THEN
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
        END IF;
        
        -- CR Accounts Payable
        v_line_number := v_line_number + 1;
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(), v_transaction_id, v_transaction_id, v_ap_account_id, 'CREDIT',
            NEW."TotalAmount", 0, NEW."TotalAmount",
            'AP - Invoice ' || NEW."SupplierInvoiceNumber",
            v_line_number, 'SUPPLIER_INVOICE', NEW."Id"::TEXT, CURRENT_TIMESTAMP, 0, CURRENT_TIMESTAMP
        );
        
        RAISE NOTICE 'Posted supplier invoice % to ledger as %', NEW."SupplierInvoiceNumber", v_transaction_number;
    END IF;
    
    RETURN NEW;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - GL failures MUST abort transaction
END;
$_$;


--
-- Name: fn_post_supplier_payment_to_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_post_supplier_payment_to_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_transaction_id UUID;
    v_transaction_number TEXT;
    v_credit_account_id UUID;
    v_credit_account_code TEXT;
    v_ap_account_id UUID;
    v_supplier_name TEXT;
BEGIN
    -- Get A/P account ID
    SELECT "Id" INTO v_ap_account_id FROM accounts WHERE "AccountCode" = '2100';
    
    -- Determine credit account based on payment method
    CASE UPPER(COALESCE(NEW."PaymentMethod", 'CASH'))
        WHEN 'CASH' THEN
            v_credit_account_code := '1010';  -- Cash on Hand
        WHEN 'BANK_TRANSFER' THEN
            v_credit_account_code := '1030';  -- Checking Account
        WHEN 'CHECK' THEN
            v_credit_account_code := '1030';  -- Checking Account
        WHEN 'CARD' THEN
            v_credit_account_code := '1030';  -- Checking Account
        ELSE
            v_credit_account_code := '1010';  -- Default to Cash
    END CASE;
    
    -- Get the credit account ID
    SELECT "Id" INTO v_credit_account_id FROM accounts WHERE "AccountCode" = v_credit_account_code;
    
    -- Fallback to Cash if account not found
    IF v_credit_account_id IS NULL THEN
        SELECT "Id" INTO v_credit_account_id FROM accounts WHERE "AccountCode" = '1010';
        v_credit_account_code := '1010';
    END IF;
    
    -- Get supplier name
    SELECT "CompanyName" INTO v_supplier_name FROM suppliers WHERE "Id" = NEW."SupplierId";
    
    IF COALESCE(NEW."Amount", 0) > 0 THEN
        v_transaction_number := generate_ledger_transaction_number();
        v_transaction_id := gen_random_uuid();
        
        -- Create ledger transaction
        INSERT INTO ledger_transactions (
            "Id", "TransactionNumber", "TransactionDate", "ReferenceType", "ReferenceId",
            "ReferenceNumber", "Description", "TotalDebitAmount", "TotalCreditAmount",
            "Status", "CreatedAt", "UpdatedAt", "IsReversed"
        ) VALUES (
            v_transaction_id,
            v_transaction_number,
            CURRENT_TIMESTAMP,
            'SUPPLIER_PAYMENT',
            NEW."Id",
            NEW."PaymentNumber",
            'Supplier Payment (' || NEW."PaymentMethod" || '): ' || COALESCE(v_supplier_name, 'Unknown') || ' - ' || NEW."PaymentNumber",
            COALESCE(NEW."Amount", 0),
            COALESCE(NEW."Amount", 0),
            'POSTED',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP,
            FALSE
        );
        
        -- DR Accounts Payable (reduce liability)
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_ap_account_id,
            'DEBIT',
            COALESCE(NEW."Amount", 0),
            COALESCE(NEW."Amount", 0),
            0,
            'AP reduced - ' || COALESCE(v_supplier_name, 'Unknown'),
            1,
            'SUPPLIER_PAYMENT',
            NEW."Id"::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- CR Cash/Bank (based on payment method)
        INSERT INTO ledger_entries (
            "Id", "TransactionId", "LedgerTransactionId", "AccountId", "EntryType",
            "Amount", "DebitAmount", "CreditAmount", "Description", "LineNumber",
            "EntityType", "EntityId", "EntryDate", "RunningBalance", "CreatedAt"
        ) VALUES (
            gen_random_uuid(),
            v_transaction_id,
            v_transaction_id,
            v_credit_account_id,
            'CREDIT',
            COALESCE(NEW."Amount", 0),
            0,
            COALESCE(NEW."Amount", 0),
            'Payment to supplier (' || NEW."PaymentMethod" || ') - ' || COALESCE(v_supplier_name, 'Unknown'),
            2,
            'SUPPLIER_PAYMENT',
            NEW."Id"::TEXT,
            CURRENT_TIMESTAMP,
            0,
            CURRENT_TIMESTAMP
        );
        
        -- Account balances are automatically updated by trg_sync_account_balance triggers
        RAISE NOTICE 'Posted supplier payment % to ledger (%) as transaction %', 
            NEW."PaymentNumber", v_credit_account_code, v_transaction_number;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_prevent_invoice_overpayment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_prevent_invoice_overpayment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_outstanding NUMERIC(15,2);
    v_invoice_number TEXT;
BEGIN
    -- Get current outstanding balance
    SELECT "OutstandingBalance", "InvoiceNumber" 
    INTO v_outstanding, v_invoice_number
    FROM invoices 
    WHERE "Id" = NEW.invoice_id;
    
    IF v_outstanding IS NULL THEN
        RAISE EXCEPTION 'Invoice not found: %', NEW.invoice_id;
    END IF;
    
    -- Check if payment exceeds outstanding balance
    IF NEW.amount > v_outstanding THEN
        RAISE EXCEPTION 'Payment amount % exceeds outstanding balance % for invoice %',
            NEW.amount, v_outstanding, v_invoice_number;
    END IF;
    
    -- Check if invoice is already fully paid
    IF v_outstanding <= 0 THEN
        RAISE EXCEPTION 'Invoice % is already fully paid', v_invoice_number;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_protect_converted_quotation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_protect_converted_quotation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- If the quotation was already CONVERTED, block status changes
    IF OLD.status = 'CONVERTED' AND NEW.status != 'CONVERTED' THEN
        RAISE EXCEPTION 'Cannot change status of a converted quotation (%). The deal is closed.', OLD.quote_number;
    END IF;

    -- If quotation has a linked sale, block all status changes
    IF OLD.converted_to_sale_id IS NOT NULL AND OLD.status != NEW.status THEN
        RAISE EXCEPTION 'Cannot change status. Quotation % has been converted to sale %. Transaction is complete.', 
            OLD.quote_number, OLD.converted_to_sale_id;
    END IF;

    -- Block attempts to clear converted_to_sale_id (prevent unlinking sales)
    IF OLD.converted_to_sale_id IS NOT NULL AND NEW.converted_to_sale_id IS NULL THEN
        RAISE EXCEPTION 'Cannot unlink quotation % from sale %. Transaction records must remain intact.', 
            OLD.quote_number, OLD.converted_to_sale_id;
    END IF;

    RETURN NEW;
END;
$$;


--
-- Name: fn_recalculate_account_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_account_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_account_id UUID;
    v_total_debits NUMERIC;
    v_total_credits NUMERIC;
    v_normal_balance TEXT;
    v_new_balance NUMERIC;
BEGIN
    -- Determine which account to update based on operation type
    IF TG_OP = 'DELETE' THEN
        v_account_id := OLD."AccountId";
    ELSE
        v_account_id := NEW."AccountId";
    END IF;
    
    -- Also handle case where AccountId changed on UPDATE
    IF TG_OP = 'UPDATE' AND OLD."AccountId" != NEW."AccountId" THEN
        -- Recalculate old account first
        SELECT 
            COALESCE(SUM("DebitAmount"), 0),
            COALESCE(SUM("CreditAmount"), 0)
        INTO v_total_debits, v_total_credits
        FROM ledger_entries
        WHERE "AccountId" = OLD."AccountId";
        
        SELECT "NormalBalance" INTO v_normal_balance
        FROM accounts WHERE "Id" = OLD."AccountId";
        
        IF v_normal_balance = 'DEBIT' THEN
            v_new_balance := v_total_debits - v_total_credits;
        ELSE
            v_new_balance := v_total_credits - v_total_debits;
        END IF;
        
        UPDATE accounts 
        SET "CurrentBalance" = v_new_balance, "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = OLD."AccountId";
    END IF;
    
    -- Calculate totals for the affected account
    SELECT 
        COALESCE(SUM("DebitAmount"), 0),
        COALESCE(SUM("CreditAmount"), 0)
    INTO v_total_debits, v_total_credits
    FROM ledger_entries
    WHERE "AccountId" = v_account_id;
    
    -- Get the account's normal balance (DEBIT or CREDIT)
    SELECT "NormalBalance" INTO v_normal_balance
    FROM accounts WHERE "Id" = v_account_id;
    
    -- Calculate balance based on normal balance convention
    -- DEBIT accounts (Assets, Expenses): balance = debits - credits
    -- CREDIT accounts (Liabilities, Equity, Revenue): balance = credits - debits
    IF v_normal_balance = 'DEBIT' THEN
        v_new_balance := v_total_debits - v_total_credits;
    ELSE
        v_new_balance := v_total_credits - v_total_debits;
    END IF;
    
    -- Update the account balance
    UPDATE accounts 
    SET "CurrentBalance" = v_new_balance, "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = v_account_id;
    
    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_recalculate_all_account_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_all_account_balances() RETURNS TABLE(account_code character varying, old_balance numeric, new_balance numeric, status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_account RECORD;
    v_calculated_balance NUMERIC;
BEGIN
    FOR v_account IN 
        SELECT a."Id", a."AccountCode", a."NormalBalance", a."CurrentBalance"
        FROM accounts a
        WHERE a."IsActive" = true
    LOOP
        -- Calculate balance from ledger entries
        SELECT 
            CASE 
                WHEN v_account."NormalBalance" = 'DEBIT' 
                THEN COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
                ELSE COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
            END INTO v_calculated_balance
        FROM ledger_entries le
        WHERE le."AccountId" = v_account."Id";

        -- Handle NULL case
        v_calculated_balance := COALESCE(v_calculated_balance, 0);

        -- Update if different
        IF v_account."CurrentBalance" IS DISTINCT FROM v_calculated_balance THEN
            UPDATE accounts 
            SET "CurrentBalance" = v_calculated_balance
            WHERE "Id" = v_account."Id";
            
            account_code := v_account."AccountCode";
            old_balance := v_account."CurrentBalance";
            new_balance := v_calculated_balance;
            status := 'UPDATED';
            RETURN NEXT;
        ELSE
            account_code := v_account."AccountCode";
            old_balance := v_account."CurrentBalance";
            new_balance := v_calculated_balance;
            status := 'UNCHANGED';
            RETURN NEXT;
        END IF;
    END LOOP;
    RETURN;
END;
$$;


--
-- Name: fn_recalculate_all_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_all_balances() RETURNS TABLE(entity_type text, total_records integer, records_updated integer, records_unchanged integer, execution_time_ms numeric)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_start_time TIMESTAMP;
    v_end_time TIMESTAMP;
    v_count RECORD;
BEGIN
    -- 1. Customer Balances
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_customer_balances();
    v_end_time := clock_timestamp();
    
    entity_type := 'CUSTOMERS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
    
    -- 2. Supplier Balances
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_supplier_balances();
    v_end_time := clock_timestamp();
    
    entity_type := 'SUPPLIERS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
    
    -- 3. Product Stock
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_product_stock();
    v_end_time := clock_timestamp();
    
    entity_type := 'PRODUCTS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
    
    -- 4. Account Balances
    v_start_time := clock_timestamp();
    SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'UPDATED') as updated,
        COUNT(*) FILTER (WHERE status = 'NO_CHANGE') as unchanged
    INTO v_count
    FROM fn_recalculate_all_account_balances();
    v_end_time := clock_timestamp();
    
    entity_type := 'ACCOUNTS';
    total_records := v_count.total;
    records_updated := v_count.updated;
    records_unchanged := v_count.unchanged;
    execution_time_ms := EXTRACT(MILLISECONDS FROM (v_end_time - v_start_time));
    RETURN NEXT;
END;
$$;


--
-- Name: fn_recalculate_all_customer_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_all_customer_balances() RETURNS TABLE(customer_id uuid, old_balance numeric, new_balance numeric, status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_customer RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_total_credit_sales NUMERIC;
    v_total_payments NUMERIC;
BEGIN
    FOR v_customer IN SELECT id, balance FROM customers LOOP
        v_old_balance := COALESCE(v_customer.balance, 0);
        
        -- Calculate expected balance (same logic as fn_update_customer_balance_internal)
        SELECT COALESCE(SUM(
            CASE 
                WHEN payment_method = 'CREDIT' AND s.status = 'COMPLETED' 
                THEN total_amount - COALESCE(amount_paid, 0)
                ELSE 0 
            END
        ), 0)
        INTO v_total_credit_sales
        FROM sales s
        WHERE s.customer_id = v_customer.id;
        
        SELECT COALESCE(SUM("Amount"), 0)
        INTO v_total_payments
        FROM customer_payments
        WHERE "CustomerId" = v_customer.id
          AND "Status" = 'COMPLETED';
        
        v_new_balance := v_total_credit_sales - v_total_payments;
        
        -- Update customer balance
        UPDATE customers
        SET balance = v_new_balance,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_customer.id;
        
        customer_id := v_customer.id;
        old_balance := v_old_balance;
        new_balance := v_new_balance;
        status := CASE 
            WHEN v_old_balance = v_new_balance THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$;


--
-- Name: fn_recalculate_all_product_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_all_product_stock() RETURNS TABLE(product_id uuid, old_quantity numeric, new_quantity numeric, status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_product RECORD;
    v_old_quantity NUMERIC;
    v_new_quantity NUMERIC;
BEGIN
    FOR v_product IN SELECT id, quantity_on_hand FROM products LOOP
        v_old_quantity := COALESCE(v_product.quantity_on_hand, 0);
        
        -- Calculate expected quantity from batches
        SELECT COALESCE(SUM(remaining_quantity), 0)
        INTO v_new_quantity
        FROM inventory_batches
        WHERE product_id = v_product.id
          AND status = 'ACTIVE';
        
        -- Update product stock
        UPDATE products
        SET quantity_on_hand = v_new_quantity,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_product.id;
        
        product_id := v_product.id;
        old_quantity := v_old_quantity;
        new_quantity := v_new_quantity;
        status := CASE 
            WHEN v_old_quantity = v_new_quantity THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$;


--
-- Name: fn_recalculate_all_supplier_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_all_supplier_balances() RETURNS TABLE(supplier_id uuid, old_balance numeric, new_balance numeric, status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier RECORD;
    v_old_balance NUMERIC;
    v_new_balance NUMERIC;
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
BEGIN
    FOR v_supplier IN SELECT "Id" as id, "OutstandingBalance" as balance FROM suppliers LOOP
        v_old_balance := COALESCE(v_supplier.balance, 0);
        
        -- Calculate expected balance (same logic as fn_update_supplier_balance_internal)
        SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
        INTO v_total_payable
        FROM goods_receipts gr
        JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
        WHERE gr.supplier_id = v_supplier.id
          AND gr.status = 'COMPLETED';
        
        SELECT COALESCE(SUM("Amount"), 0)
        INTO v_total_paid
        FROM supplier_payments
        WHERE "SupplierId" = v_supplier.id
          AND "Status" = 'COMPLETED';
        
        v_new_balance := v_total_payable - v_total_paid;
        
        -- Update supplier balance
        UPDATE suppliers
        SET "OutstandingBalance" = v_new_balance,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = v_supplier.id;
        
        supplier_id := v_supplier.id;
        old_balance := v_old_balance;
        new_balance := v_new_balance;
        status := CASE 
            WHEN v_old_balance = v_new_balance THEN 'NO_CHANGE'
            ELSE 'UPDATED'
        END;
        
        RETURN NEXT;
    END LOOP;
END;
$$;


--
-- Name: fn_recalculate_customer_ar_balance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_customer_ar_balance(p_customer_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_outstanding NUMERIC;
BEGIN
    -- Sum outstanding balances from all invoices for this customer
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_total_outstanding
    FROM invoices
    WHERE "CustomerId" = p_customer_id
      AND "Status" NOT IN ('Cancelled', 'Voided');
    
    -- Update customer balance (customers table uses snake_case)
    UPDATE customers
    SET balance = v_total_outstanding,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;
    
    RAISE NOTICE 'Updated customer % AR balance to %', p_customer_id, v_total_outstanding;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_recalculate_customer_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_customer_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    -- Determine which customer to update
    IF TG_TABLE_NAME = 'sales' THEN
        -- sales table uses snake_case
        IF TG_OP = 'DELETE' THEN
            v_customer_id := OLD.customer_id;
        ELSE
            v_customer_id := NEW.customer_id;
            -- Also handle customer change
            IF TG_OP = 'UPDATE' AND OLD.customer_id IS DISTINCT FROM NEW.customer_id AND OLD.customer_id IS NOT NULL THEN
                PERFORM fn_update_customer_balance_internal(OLD.customer_id);
            END IF;
        END IF;
    ELSIF TG_TABLE_NAME = 'customer_payments' THEN
        -- customer_payments uses PascalCase: "CustomerId"
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
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_recalculate_gr_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_gr_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_gr_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_gr_id := OLD.goods_receipt_id;
    ELSE
        v_gr_id := NEW.goods_receipt_id;
        IF TG_OP = 'UPDATE' AND OLD.goods_receipt_id IS DISTINCT FROM NEW.goods_receipt_id THEN
            PERFORM fn_update_gr_totals_internal(OLD.goods_receipt_id);
        END IF;
    END IF;
    
    IF v_gr_id IS NOT NULL THEN
        PERFORM fn_update_gr_totals_internal(v_gr_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_recalculate_invoice_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_invoice_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_invoice_id := OLD.invoice_id;
    ELSE
        v_invoice_id := NEW.invoice_id;
    END IF;
    
    IF v_invoice_id IS NOT NULL THEN
        PERFORM fn_update_invoice_balance_internal(v_invoice_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_recalculate_po_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_po_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_po_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_po_id := OLD.purchase_order_id;
    ELSE
        v_po_id := NEW.purchase_order_id;
        IF TG_OP = 'UPDATE' AND OLD.purchase_order_id IS DISTINCT FROM NEW.purchase_order_id THEN
            PERFORM fn_update_po_totals_internal(OLD.purchase_order_id);
        END IF;
    END IF;
    
    IF v_po_id IS NOT NULL THEN
        PERFORM fn_update_po_totals_internal(v_po_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_recalculate_product_stock(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_product_stock() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_product_id UUID;
    v_total_quantity NUMERIC;
BEGIN
    -- Determine which product to update
    IF TG_OP = 'DELETE' THEN
        v_product_id := OLD.product_id;
    ELSE
        v_product_id := NEW.product_id;
        -- Also handle product change on UPDATE
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
END;
$$;


--
-- Name: fn_recalculate_sale_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_sale_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale_id UUID;
    v_total_amount NUMERIC;
    v_total_cost NUMERIC;
    v_total_discount NUMERIC;
    v_item_count INTEGER;
BEGIN
    -- Determine which sale to update
    IF TG_OP = 'DELETE' THEN
        v_sale_id := OLD.sale_id;
    ELSE
        v_sale_id := NEW.sale_id;
        -- Handle sale change on UPDATE
        IF TG_OP = 'UPDATE' AND OLD.sale_id IS DISTINCT FROM NEW.sale_id THEN
            PERFORM fn_update_sale_totals_internal(OLD.sale_id);
        END IF;
    END IF;
    
    IF v_sale_id IS NOT NULL THEN
        PERFORM fn_update_sale_totals_internal(v_sale_id);
    END IF;
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_recalculate_supplier_ap_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_supplier_ap_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier_id UUID;
    v_new_balance NUMERIC;
BEGIN
    -- Determine which supplier to update
    IF TG_OP = 'DELETE' THEN
        v_supplier_id := OLD."SupplierId";
    ELSE
        v_supplier_id := NEW."SupplierId";
    END IF;

    IF v_supplier_id IS NOT NULL THEN
        PERFORM fn_update_supplier_balance_internal(v_supplier_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_recalculate_supplier_ap_balance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_supplier_ap_balance(p_supplier_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_outstanding NUMERIC;
BEGIN
    -- Sum outstanding balances from all supplier invoices
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_total_outstanding
    FROM supplier_invoices
    WHERE "SupplierId" = p_supplier_id
      AND "Status" NOT IN ('Cancelled', 'Voided')
      AND deleted_at IS NULL;
    
    -- Update supplier balance (suppliers uses PascalCase)
    UPDATE suppliers
    SET "OutstandingBalance" = v_total_outstanding,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
    RAISE NOTICE 'Updated supplier % AP balance to %', p_supplier_id, v_total_outstanding;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_recalculate_supplier_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recalculate_supplier_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    -- Determine which supplier to update
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
END;
$$;


--
-- Name: fn_reconcile_accounts_payable(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconcile_accounts_payable(p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(source text, description text, amount numeric, difference numeric, status text, details jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_supplier_balance NUMERIC(18,6) := 0;
    v_gr_balance NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
BEGIN
    -- Get GL AP balance (Account 2100) - credit balance is positive
    SELECT COALESCE(SUM(le."CreditAmount") - SUM(le."DebitAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '2100'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Get sum of supplier outstanding balances
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_supplier_balance
    FROM suppliers;
    
    -- Get sum of outstanding supplier invoices
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_gr_balance
    FROM supplier_invoices
    WHERE "Status" NOT IN ('PAID', 'CANCELLED')
      AND deleted_at IS NULL;
    
    v_difference := v_gl_balance - v_supplier_balance;
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_AP_BALANCE'::TEXT,
        'Accounts Payable (2100) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'SUPPLIER_BALANCE'::TEXT,
        'Sum of supplier OutstandingBalance fields'::TEXT,
        v_supplier_balance,
        v_gl_balance - v_supplier_balance,
        CASE 
            WHEN ABS(v_gl_balance - v_supplier_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'GR_BALANCE'::TEXT,
        'Sum of outstanding supplier invoice balances'::TEXT,
        v_gr_balance,
        v_supplier_balance - v_gr_balance,
        CASE 
            WHEN ABS(v_supplier_balance - v_gr_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
END;
$$;


--
-- Name: fn_reconcile_accounts_receivable(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconcile_accounts_receivable(p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(source text, description text, amount numeric, difference numeric, status text, details jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_customer_balance NUMERIC(18,6) := 0;
    v_invoice_balance NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
    v_customer_details JSONB;
BEGIN
    -- Get GL AR balance (Account 1200)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1200'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Get sum of customer balances
    SELECT COALESCE(SUM(balance), 0)
    INTO v_customer_balance
    FROM customers;
    
    -- Get sum of outstanding invoice balances
    -- Handle both PascalCase (PartiallyPaid) and SCREAMING_SNAKE_CASE (PARTIALLY_PAID) status values
    SELECT COALESCE(SUM("OutstandingBalance"), 0)
    INTO v_invoice_balance
    FROM invoices
    WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING');
    
    v_difference := v_gl_balance - v_invoice_balance;
    
    -- Get customer-level detail for discrepancies
    SELECT jsonb_agg(jsonb_build_object(
        'customer_id', c.id,
        'customer_name', c.name,
        'customer_balance', c.balance,
        'invoice_balance', COALESCE(inv.total_due, 0),
        'difference', c.balance - COALESCE(inv.total_due, 0)
    ))
    INTO v_customer_details
    FROM customers c
    LEFT JOIN (
        SELECT "CustomerId" as customer_id, SUM("OutstandingBalance") as total_due
        FROM invoices
        WHERE UPPER(REPLACE("Status", '_', '')) IN ('ISSUED', 'UNPAID', 'PARTIALLYPAID', 'PENDING')
        GROUP BY "CustomerId"
    ) inv ON inv.customer_id = c.id
    WHERE ABS(c.balance - COALESCE(inv.total_due, 0)) > 0.01;
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_AR_BALANCE'::TEXT,
        'Accounts Receivable (1200) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'INVOICE_BALANCE'::TEXT,
        'Sum of outstanding invoice balances'::TEXT,
        v_invoice_balance,
        v_gl_balance - v_invoice_balance,
        CASE 
            WHEN ABS(v_gl_balance - v_invoice_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'CUSTOMER_BALANCE'::TEXT,
        'Sum of customer.balance fields'::TEXT,
        v_customer_balance,
        v_invoice_balance - v_customer_balance,
        CASE 
            WHEN ABS(v_invoice_balance - v_customer_balance) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    IF v_customer_details IS NOT NULL THEN
        RETURN QUERY SELECT 
            'CUSTOMER_DETAILS'::TEXT,
            'Customers with balance discrepancies'::TEXT,
            0::NUMERIC(18,6),
            0::NUMERIC(18,6),
            'INFO'::TEXT,
            v_customer_details;
    END IF;
END;
$$;


--
-- Name: fn_reconcile_cash_account(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconcile_cash_account(p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(source text, description text, amount numeric, difference numeric, status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_expected_cash NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
BEGIN
    -- Get GL Cash balance (Account 1010)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1010'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Calculate expected cash from payments
    SELECT COALESCE(SUM(
        CASE 
            WHEN ip.payment_method = 'CASH' THEN ip.amount 
            ELSE 0 
        END
    ), 0)
    INTO v_expected_cash
    FROM invoice_payments ip
    WHERE ip.payment_date::DATE <= p_as_of_date;
    
    v_difference := v_gl_balance - v_expected_cash;
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_BALANCE'::TEXT,
        'Cash account (1010) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT;
    
    RETURN QUERY SELECT 
        'EXPECTED_CASH'::TEXT,
        'Sum of CASH payments from invoice_payments'::TEXT,
        v_expected_cash,
        v_difference,
        CASE 
            WHEN ABS(v_difference) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT;
    
    IF ABS(v_difference) >= 0.01 THEN
        RETURN QUERY SELECT 
            'DIFFERENCE'::TEXT,
            'Unexplained difference requiring investigation'::TEXT,
            v_difference,
            v_difference,
            'ACTION_REQUIRED'::TEXT;
    END IF;
END;
$$;


--
-- Name: fn_reconcile_inventory(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reconcile_inventory(p_as_of_date date DEFAULT CURRENT_DATE) RETURNS TABLE(source text, description text, amount numeric, difference numeric, status text, details jsonb)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_gl_balance NUMERIC(18,6) := 0;
    v_inventory_value NUMERIC(18,6) := 0;
    v_batch_value NUMERIC(18,6) := 0;
    v_difference NUMERIC(18,6);
BEGIN
    -- Get GL Inventory balance (Account 1300)
    SELECT COALESCE(SUM(le."DebitAmount") - SUM(le."CreditAmount"), 0)
    INTO v_gl_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."TransactionId" = lt."Id"
    JOIN accounts a ON le."AccountId" = a."Id"
    WHERE a."AccountCode" = '1300'
      AND lt."TransactionDate"::DATE <= p_as_of_date;
    
    -- Get inventory value from products (quantity_on_hand * cost_price)
    SELECT COALESCE(SUM(quantity_on_hand * COALESCE(cost_price, 0)), 0)
    INTO v_inventory_value
    FROM products
    WHERE quantity_on_hand > 0;
    
    -- Get inventory value from batches (more accurate if using FEFO)
    SELECT COALESCE(SUM(remaining_quantity * cost_price), 0)
    INTO v_batch_value
    FROM inventory_batches
    WHERE remaining_quantity > 0;
    
    v_difference := v_gl_balance - GREATEST(v_inventory_value, v_batch_value);
    
    -- Return reconciliation report
    RETURN QUERY SELECT 
        'GL_INVENTORY_BALANCE'::TEXT,
        'Inventory (1300) balance from General Ledger'::TEXT,
        v_gl_balance,
        0::NUMERIC(18,6),
        'BASE'::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'PRODUCT_VALUATION'::TEXT,
        'Sum of (quantity_on_hand × cost_price) from products table'::TEXT,
        v_inventory_value,
        v_gl_balance - v_inventory_value,
        CASE 
            WHEN ABS(v_gl_balance - v_inventory_value) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
    
    RETURN QUERY SELECT 
        'BATCH_VALUATION'::TEXT,
        'Sum of (remaining_quantity × cost_price) from inventory_batches'::TEXT,
        v_batch_value,
        v_gl_balance - v_batch_value,
        CASE 
            WHEN ABS(v_gl_balance - v_batch_value) < 0.01 THEN 'MATCHED'
            ELSE 'DISCREPANCY'
        END::TEXT,
        NULL::JSONB;
END;
$$;


--
-- Name: fn_recover_missing_gl_postings(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_recover_missing_gl_postings() RETURNS TABLE(transaction_type text, reference_number text, action_taken text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sale RECORD;
    v_invoice_payment RECORD;
    v_count INTEGER := 0;
BEGIN
    -- Find completed sales without GL entries
    FOR v_sale IN 
        SELECT s.id, s.sale_number, s.total_amount, s.total_cost, s.sale_date, s.payment_method
        FROM sales s
        LEFT JOIN ledger_transactions lt ON lt."ReferenceType" = 'SALE' AND lt."ReferenceId" = s.id
        WHERE s.status = 'COMPLETED' AND lt."Id" IS NULL
    LOOP
        -- Trigger will not fire automatically, so we need to manually simulate
        -- Mark sale as incomplete and then complete again to trigger GL posting
        UPDATE sales SET status = 'PENDING' WHERE id = v_sale.id;
        UPDATE sales SET status = 'COMPLETED' WHERE id = v_sale.id;
        
        v_count := v_count + 1;
        transaction_type := 'SALE';
        reference_number := v_sale.sale_number;
        action_taken := 'Re-triggered GL posting';
        RETURN NEXT;
    END LOOP;
    
    -- Find invoice payments for CREDIT sales without GL entries
    FOR v_invoice_payment IN
        SELECT ip.id, ip.receipt_number, ip.amount, ip.payment_method, ip.invoice_id
        FROM invoice_payments ip
        JOIN invoices i ON i."Id" = ip.invoice_id
        LEFT JOIN sales s ON s.id = i."SaleId"
        LEFT JOIN ledger_transactions lt ON lt."ReferenceType" = 'INVOICE_PAYMENT' AND lt."ReferenceId" = ip.id
        WHERE lt."Id" IS NULL
          AND (s.payment_method IS NULL OR s.payment_method != 'CASH')
    LOOP
        -- Manually call the trigger function
        PERFORM fn_post_invoice_payment_to_ledger_manual(v_invoice_payment.id);
        
        v_count := v_count + 1;
        transaction_type := 'INVOICE_PAYMENT';
        reference_number := v_invoice_payment.receipt_number;
        action_taken := 'Posted missing GL entry';
        RETURN NEXT;
    END LOOP;
    
    IF v_count = 0 THEN
        transaction_type := 'NONE';
        reference_number := '-';
        action_taken := 'All transactions have GL entries';
        RETURN NEXT;
    END IF;
END;
$$;


--
-- Name: fn_refresh_expense_summary(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_refresh_expense_summary() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_expense_summary;
    RETURN NULL;
EXCEPTION
    WHEN OTHERS THEN
        -- If concurrent refresh fails, do regular refresh (acceptable fallback)
        BEGIN
            REFRESH MATERIALIZED VIEW mv_expense_summary;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'Expense summary refresh failed: % - dashboard may be stale', SQLERRM;
        END;
        RETURN NULL;
END;
$$;


--
-- Name: fn_reopen_accounting_period(integer, integer, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reopen_accounting_period(p_year integer, p_month integer, p_reopened_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text) RETURNS TABLE(success boolean, message text, period_id uuid)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_period_id UUID;
    v_current_status VARCHAR(20);
BEGIN
    -- Check if period exists
    SELECT id, status INTO v_period_id, v_current_status
    FROM accounting_periods
    WHERE period_year = p_year AND period_month = p_month
    FOR UPDATE;
    
    IF v_period_id IS NULL THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s does not exist', p_year, LPAD(p_month::TEXT, 2, '0')),
            NULL::UUID;
        RETURN;
    END IF;
    
    -- Check if LOCKED (cannot reopen)
    IF v_current_status = 'LOCKED' THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s is LOCKED and cannot be reopened', p_year, LPAD(p_month::TEXT, 2, '0')),
            v_period_id;
        RETURN;
    END IF;
    
    -- Check if already open
    IF v_current_status = 'OPEN' THEN
        RETURN QUERY SELECT 
            FALSE, 
            FORMAT('Period %s-%s is already open', p_year, LPAD(p_month::TEXT, 2, '0')),
            v_period_id;
        RETURN;
    END IF;
    
    -- Reopen the period
    UPDATE accounting_periods
    SET 
        status = 'OPEN',
        reopened_at = NOW(),
        reopened_by = p_reopened_by,
        reopen_reason = p_reason,
        updated_at = NOW()
    WHERE id = v_period_id;
    
    -- Record in history
    INSERT INTO accounting_period_history (
        period_id, action, performed_by, period_year, period_month,
        previous_status, new_status, notes
    ) VALUES (
        v_period_id, 'REOPENED', p_reopened_by, p_year, p_month,
        'CLOSED', 'OPEN', p_reason
    );
    
    RETURN QUERY SELECT 
        TRUE, 
        FORMAT('Period %s-%s reopened successfully', p_year, LPAD(p_month::TEXT, 2, '0')),
        v_period_id;
END;
$$;


--
-- Name: fn_reset_accounting_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_reset_accounting_complete() RETURNS TABLE(step_name text, records_affected integer, status text)
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_count INTEGER;
BEGIN
    -- Step 1: Clear all ledger entries
    DELETE FROM ledger_entries;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'ledger_entries';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 2: Clear all ledger transactions  
    DELETE FROM ledger_transactions;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'ledger_transactions';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 3: Clear journal entry lines
    DELETE FROM journal_entry_lines WHERE TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'journal_entry_lines';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 4: Clear journal entries
    DELETE FROM journal_entries WHERE TRUE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'journal_entries';
    records_affected := v_count;
    status := 'CLEARED';
    RETURN NEXT;

    -- Step 5: Reset ALL account current balances to 0
    UPDATE accounts SET "CurrentBalance" = 0;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    step_name := 'accounts_balance_reset';
    records_affected := v_count;
    status := 'RESET_TO_ZERO';
    RETURN NEXT;

    -- Step 6: Verify accounts are all zero
    SELECT COUNT(*) INTO v_count FROM accounts WHERE "CurrentBalance" != 0;
    step_name := 'verify_zero_balances';
    records_affected := v_count;
    status := CASE WHEN v_count = 0 THEN 'VERIFIED' ELSE 'WARNING' END;
    RETURN NEXT;

    RETURN;
EXCEPTION
    WHEN OTHERS THEN
        step_name := 'ERROR';
        records_affected := 0;
        status := SQLERRM;
        RETURN NEXT;
END;
$$;


--
-- Name: fn_sale_items_set_product_type(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sale_items_set_product_type() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_product_type VARCHAR(20);
  v_income_account_id UUID;
BEGIN
  -- Check if this is a custom item (no product_id)
  IF NEW.product_id IS NULL THEN
    -- Custom items are always services (generator repair, one-off items, etc.)
    NEW.product_type := 'service';
    
    -- Set income account to Service Revenue (4100)
    SELECT "Id" INTO v_income_account_id
    FROM accounts 
    WHERE "AccountCode" = '4100' 
    LIMIT 1;
    
    NEW.income_account_id := v_income_account_id;
    
    RETURN NEW;
  END IF;

  -- For regular products, get product type and income account from products table
  SELECT 
    product_type,
    COALESCE(
      income_account_id,
      -- Default fallback if product doesn't have income_account_id set
      CASE
        WHEN product_type = 'service' THEN
          (SELECT "Id" FROM accounts WHERE "AccountCode" = '4100' LIMIT 1)
        ELSE
          (SELECT "Id" FROM accounts WHERE "AccountCode" = '4000' LIMIT 1)
      END
    )
  INTO v_product_type, v_income_account_id
  FROM products
  WHERE id = NEW.product_id;

  -- Set the product_type on the sale_item (overrides user input)
  NEW.product_type := COALESCE(v_product_type, 'inventory');
  
  -- Set the income_account_id (overrides user input)
  NEW.income_account_id := v_income_account_id;

  RETURN NEW;
END;
$$;


--
-- Name: FUNCTION fn_sale_items_set_product_type(); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.fn_sale_items_set_product_type() IS 'Sets product_type and income_account_id for sale items. 
Custom items (product_id IS NULL) default to service type.
Regular items inherit type from products table.';


--
-- Name: fn_sync_account_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_account_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_account_type VARCHAR(50);
    v_new_balance NUMERIC(15,2);
BEGIN
    -- Determine which account to update based on operation type
    IF TG_OP = 'DELETE' THEN
        -- Recalculate balance for the deleted entry's account
        SELECT a."AccountType" INTO v_account_type
        FROM accounts a
        WHERE a."Id" = OLD."AccountId";
        
        -- Calculate new balance based on account type
        -- ASSET/EXPENSE: Debits increase, Credits decrease
        -- LIABILITY/EQUITY/REVENUE: Credits increase, Debits decrease
        SELECT 
            CASE 
                WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = OLD."AccountId";
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE(v_new_balance, 0),
            "UpdatedAt" = NOW()
        WHERE "Id" = OLD."AccountId";
        
        RETURN OLD;
        
    ELSIF TG_OP = 'UPDATE' THEN
        -- If AccountId changed, update both old and new accounts
        IF OLD."AccountId" != NEW."AccountId" THEN
            -- Update old account
            SELECT a."AccountType" INTO v_account_type
            FROM accounts a
            WHERE a."Id" = OLD."AccountId";
            
            SELECT 
                CASE 
                    WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                    THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                    ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
                END INTO v_new_balance
            FROM ledger_entries
            WHERE "AccountId" = OLD."AccountId";
            
            UPDATE accounts 
            SET "CurrentBalance" = COALESCE(v_new_balance, 0),
                "UpdatedAt" = NOW()
            WHERE "Id" = OLD."AccountId";
        END IF;
        
        -- Update new/current account
        SELECT a."AccountType" INTO v_account_type
        FROM accounts a
        WHERE a."Id" = NEW."AccountId";
        
        SELECT 
            CASE 
                WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = NEW."AccountId";
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE(v_new_balance, 0),
            "UpdatedAt" = NOW()
        WHERE "Id" = NEW."AccountId";
        
        RETURN NEW;
        
    ELSE -- INSERT
        -- Get account type for the new entry's account
        SELECT a."AccountType" INTO v_account_type
        FROM accounts a
        WHERE a."Id" = NEW."AccountId";
        
        -- Calculate new balance including this entry
        SELECT 
            CASE 
                WHEN v_account_type IN ('ASSET', 'EXPENSE') 
                THEN COALESCE(SUM("DebitAmount"), 0) - COALESCE(SUM("CreditAmount"), 0)
                ELSE COALESCE(SUM("CreditAmount"), 0) - COALESCE(SUM("DebitAmount"), 0)
            END INTO v_new_balance
        FROM ledger_entries
        WHERE "AccountId" = NEW."AccountId";
        
        UPDATE accounts 
        SET "CurrentBalance" = COALESCE(v_new_balance, 0),
            "UpdatedAt" = NOW()
        WHERE "Id" = NEW."AccountId";
        
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: fn_sync_customer_on_invoice_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_customer_on_invoice_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_customer_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_customer_id := OLD."CustomerId";
    ELSE
        v_customer_id := NEW."CustomerId";
        -- Handle customer change
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
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate to abort transaction
END;
$$;


--
-- Name: fn_sync_invoice_ar_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_invoice_ar_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_ar_account_id UUID;
    v_old_outstanding NUMERIC := 0;
    v_new_outstanding NUMERIC := 0;
    v_delta NUMERIC;
BEGIN
    -- Get AR account ID
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    
    IF TG_OP = 'UPDATE' THEN
        v_old_outstanding := COALESCE(OLD."OutstandingBalance", 0);
        v_new_outstanding := COALESCE(NEW."OutstandingBalance", 0);
        v_delta := v_new_outstanding - v_old_outstanding;
        
        -- Only update if there's a change and not cancelled
        IF ABS(v_delta) > 0.001 AND NEW."Status" != 'CANCELLED' THEN
            -- Update AR account
            UPDATE accounts 
            SET "CurrentBalance" = "CurrentBalance" + v_delta,
                "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_ar_account_id;
            
            -- Update customer balance
            UPDATE customers 
            SET balance = balance + v_delta,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW."CustomerId";
            
            RAISE NOTICE 'Invoice % AR updated: delta=%', NEW."InvoiceNumber", v_delta;
        END IF;
        
        -- Handle cancellation
        IF NEW."Status" = 'CANCELLED' AND OLD."Status" != 'CANCELLED' THEN
            -- Reverse the outstanding from AR
            UPDATE accounts 
            SET "CurrentBalance" = "CurrentBalance" - v_old_outstanding,
                "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_ar_account_id;
            
            -- Reduce customer balance
            UPDATE customers 
            SET balance = balance - v_old_outstanding,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW."CustomerId";
            
            RAISE NOTICE 'Invoice % cancelled, reversed AR: %', NEW."InvoiceNumber", v_old_outstanding;
        END IF;
        
    ELSIF TG_OP = 'INSERT' THEN
        v_new_outstanding := COALESCE(NEW."OutstandingBalance", NEW."TotalAmount");
        
        IF NEW."Status" NOT IN ('CANCELLED', 'PAID') THEN
            -- Add to AR account
            UPDATE accounts 
            SET "CurrentBalance" = "CurrentBalance" + v_new_outstanding,
                "UpdatedAt" = CURRENT_TIMESTAMP
            WHERE "Id" = v_ar_account_id;
            
            -- Add to customer balance
            UPDATE customers 
            SET balance = balance + v_new_outstanding,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = NEW."CustomerId";
            
            RAISE NOTICE 'New invoice % added to AR: %', NEW."InvoiceNumber", v_new_outstanding;
        END IF;
    END IF;
    
    RETURN NEW;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - AR sync failures MUST abort transaction
END;
$$;


--
-- Name: fn_sync_invoice_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_invoice_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_invoice RECORD;
BEGIN
    IF TG_OP = 'INSERT' THEN
        -- Get invoice details
        SELECT "InvoiceNumber", "CustomerId" INTO v_invoice
        FROM invoices WHERE "Id" = NEW.invoice_id;
        
        -- Update invoice paid amount and outstanding
        -- NOTE: GL posting is handled by trg_post_invoice_payment_to_ledger
        UPDATE invoices SET
            "AmountPaid" = "AmountPaid" + NEW.amount,
            "OutstandingBalance" = "TotalAmount" - ("AmountPaid" + NEW.amount),
            "Status" = CASE 
                WHEN ("AmountPaid" + NEW.amount) >= "TotalAmount" THEN 'PAID'
                WHEN ("AmountPaid" + NEW.amount) > 0 THEN 'PartiallyPaid'
                ELSE "Status"
            END,
            "UpdatedAt" = CURRENT_TIMESTAMP
        WHERE "Id" = NEW.invoice_id;
        
        -- Update customer balance (reduce AR)
        UPDATE customers 
        SET balance = GREATEST(0, balance - NEW.amount),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = v_invoice."CustomerId";
        
        RAISE NOTICE 'Invoice payment % synced: amount=%, receipt=%', 
            NEW.id, NEW.amount, NEW.receipt_number;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_sync_supplier_on_invoice_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_supplier_on_invoice_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_supplier_id := OLD."SupplierId";
    ELSE
        v_supplier_id := NEW."SupplierId";
        -- Handle supplier change
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
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_sync_supplier_on_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_supplier_on_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_sync_supplier_payment_allocation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_sync_supplier_payment_allocation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
$$;


--
-- Name: fn_update_bank_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_bank_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.is_reversed = FALSE THEN
        -- Calculate balance change
        IF NEW.type IN ('DEPOSIT', 'TRANSFER_IN', 'INTEREST') THEN
            UPDATE bank_accounts 
            SET current_balance = current_balance + NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.bank_account_id;
        ELSE
            UPDATE bank_accounts 
            SET current_balance = current_balance - NEW.amount,
                updated_at = NOW()
            WHERE id = NEW.bank_account_id;
        END IF;
        
        -- Set running balance
        SELECT current_balance INTO NEW.running_balance
        FROM bank_accounts WHERE id = NEW.bank_account_id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: fn_update_customer_balance_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_customer_balance_internal(p_customer_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_credit_sales NUMERIC;
    v_total_payments NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Sum all CREDIT sales (unpaid portion) - sales table uses snake_case
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
    
    -- Sum all customer payments applied to AR
    -- customer_payments uses PascalCase: "Amount", "CustomerId", "Status"
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_total_payments
    FROM customer_payments
    WHERE "CustomerId" = p_customer_id
      AND "Status" = 'COMPLETED';
    
    -- Balance = Credit Sales - Payments received
    v_new_balance := v_total_credit_sales - v_total_payments;
    
    -- Update customer balance (customers table uses snake_case)
    UPDATE customers
    SET balance = v_new_balance,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_customer_id;
    
    RAISE NOTICE 'Updated customer % balance to %', p_customer_id, v_new_balance;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_update_gr_totals_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_gr_totals_internal(p_gr_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_value NUMERIC;
    v_item_count INTEGER;
BEGIN
    SELECT 
        COALESCE(SUM(received_quantity * cost_price), 0),
        COUNT(*)
    INTO v_total_value, v_item_count
    FROM goods_receipt_items
    WHERE goods_receipt_id = p_gr_id;
    
    UPDATE goods_receipts
    SET total_value = v_total_value,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_gr_id;
    
    RAISE NOTICE 'Updated GR % total to %', p_gr_id, v_total_value;
END;
$$;


--
-- Name: fn_update_invoice_balance_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_invoice_balance_internal(p_invoice_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_amount NUMERIC;
    v_total_paid NUMERIC;
    v_balance NUMERIC;
    v_new_status TEXT;
BEGIN
    -- Get invoice total (invoices table has PascalCase columns)
    SELECT COALESCE("TotalAmount", 0)
    INTO v_total_amount
    FROM invoices
    WHERE "Id" = p_invoice_id;
    
    -- Sum payments for this invoice (invoice_payments has lowercase columns)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM invoice_payments
    WHERE invoice_id = p_invoice_id;
    
    v_balance := v_total_amount - v_total_paid;
    
    -- Determine status (invoices table uses: Paid, PartiallyPaid, Unpaid)
    IF v_balance <= 0 THEN
        v_new_status := 'Paid';
    ELSIF v_total_paid > 0 THEN
        v_new_status := 'PartiallyPaid';
    ELSE
        v_new_status := 'Unpaid';
    END IF;
    
    -- Update invoice (use OutstandingBalance not BalanceDue)
    UPDATE invoices
    SET "AmountPaid" = v_total_paid,
        "OutstandingBalance" = GREATEST(v_balance, 0),
        "Status" = v_new_status,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_invoice_id;
    
    RAISE NOTICE 'Updated invoice % balance to %, status=%', p_invoice_id, v_balance, v_new_status;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_update_po_totals_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_po_totals_internal(p_po_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_amount NUMERIC;
    v_item_count INTEGER;
BEGIN
    SELECT 
        COALESCE(SUM(quantity * unit_price), 0),
        COUNT(*)
    INTO v_total_amount, v_item_count
    FROM purchase_order_items
    WHERE purchase_order_id = p_po_id;
    
    UPDATE purchase_orders
    SET total_amount = v_total_amount,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_po_id;
    
    RAISE NOTICE 'Updated PO % total to %', p_po_id, v_total_amount;
END;
$$;


--
-- Name: fn_update_product_stock_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_product_stock_internal(p_product_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_quantity NUMERIC;
BEGIN
    -- Sum all batch quantities for this product
    -- Note: inventory_batches uses 'status' column (enum), not 'is_active'
    SELECT COALESCE(SUM(remaining_quantity), 0)
    INTO v_total_quantity
    FROM inventory_batches
    WHERE product_id = p_product_id
      AND status = 'ACTIVE';
    
    -- Update product stock quantity (column is quantity_on_hand, not stock_quantity)
    UPDATE products
    SET quantity_on_hand = v_total_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_product_id;
    
    RAISE NOTICE 'Updated product % stock to %', p_product_id, v_total_quantity;
    -- FIXED: Removed EXCEPTION WHEN OTHERS - errors must propagate
END;
$$;


--
-- Name: fn_update_sale_totals_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_sale_totals_internal(p_sale_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_amount NUMERIC;
    v_total_cost NUMERIC;
    v_total_discount NUMERIC;
    v_profit NUMERIC;
    v_profit_margin NUMERIC;
    v_tax_amount NUMERIC;
    v_subtotal NUMERIC;
BEGIN
    -- Get the existing tax_amount from the sale (preserve user input)
    SELECT tax_amount INTO v_tax_amount FROM sales WHERE id = p_sale_id;
    v_tax_amount := COALESCE(v_tax_amount, 0);
    
    -- Calculate totals from sale items (using correct column names)
    -- NOTE: sales table does NOT have item_count or updated_at columns
    SELECT 
        COALESCE(SUM(quantity * unit_price), 0),
        COALESCE(SUM(quantity * COALESCE(unit_cost, 0)), 0),
        COALESCE(SUM(COALESCE(discount_amount, 0)), 0)
    INTO v_subtotal, v_total_cost, v_total_discount
    FROM sale_items
    WHERE sale_id = p_sale_id;
    
    -- Calculate TOTAL including tax: (subtotal - discount) + tax
    v_total_amount := v_subtotal - v_total_discount + v_tax_amount;
    
    -- Calculate profit (EXCLUDING tax - tax is government money, not profit)
    -- Profit = Revenue - Cost, where Revenue = Subtotal - Discount (before tax)
    v_profit := (v_subtotal - v_total_discount) - v_total_cost;
    
    -- Calculate profit margin as decimal ratio (0.25 = 25%), NOT percentage
    -- The profit_margin column is DECIMAL(5,4), so max value is ~9.9999
    -- Margin based on revenue BEFORE tax
    IF (v_subtotal - v_total_discount) > 0 THEN
        v_profit_margin := v_profit / (v_subtotal - v_total_discount);
    ELSE
        v_profit_margin := 0;
    END IF;
    
    -- Update sale record - only columns that exist in the sales table
    UPDATE sales
    SET total_amount = v_total_amount,
        total_cost = v_total_cost,
        profit = v_profit,
        profit_margin = v_profit_margin,
        discount_amount = v_total_discount
    WHERE id = p_sale_id;
    
    RAISE NOTICE 'Updated sale % totals: subtotal=%, tax=%, total=%, cost=%, profit=%', 
        p_sale_id, v_subtotal - v_total_discount, v_tax_amount, v_total_amount, v_total_cost, v_profit;
END;
$$;


--
-- Name: fn_update_supplier_balance_internal(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_update_supplier_balance_internal(p_supplier_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_total_payable NUMERIC;
    v_total_paid NUMERIC;
    v_new_balance NUMERIC;
BEGIN
    -- Sum all completed GR values
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_total_payable
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    WHERE gr.supplier_id = p_supplier_id
      AND gr.status = 'COMPLETED';
    
    -- Sum all supplier payments
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_total_paid
    FROM supplier_payments
    WHERE "SupplierId" = p_supplier_id
      AND "Status" = 'COMPLETED';
    
    -- Balance = What we owe - What we paid
    v_new_balance := v_total_payable - v_total_paid;
    
    -- Update supplier balance (correct column is "OutstandingBalance")
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = CURRENT_TIMESTAMP
    WHERE "Id" = p_supplier_id;
    
    RAISE NOTICE 'Updated supplier % balance to %', p_supplier_id, v_new_balance;
END;
$$;


--
-- Name: fn_validate_quotation_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_quotation_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  expected_total NUMERIC(15,2);
  tolerance NUMERIC(15,2) := 1.00;
BEGIN
  -- Calculate expected total: subtotal - discount + tax
  expected_total := NEW.subtotal - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.tax_amount, 0);
  
  -- Check if total matches expected (within tolerance)
  IF ABS(expected_total - NEW.total_amount) > tolerance THEN
    RAISE EXCEPTION 'Quotation total validation failed: expected % but got %. subtotal=%, discount=%, tax=%',
      expected_total, NEW.total_amount, NEW.subtotal, COALESCE(NEW.discount_amount, 0), COALESCE(NEW.tax_amount, 0);
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: fn_validate_sale_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_validate_sale_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  expected_total NUMERIC(15,2);
  tolerance NUMERIC(15,2) := 1.00; -- Allow 1 unit tolerance for rounding
BEGIN
  -- Calculate expected total: subtotal - discount + tax
  expected_total := NEW.subtotal - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.tax_amount, 0);
  
  -- Check if total matches expected (within tolerance)
  IF ABS(expected_total - NEW.total_amount) > tolerance THEN
    RAISE EXCEPTION 'Sale total validation failed: expected % but got %. subtotal=%, discount=%, tax=%',
      expected_total, NEW.total_amount, NEW.subtotal, COALESCE(NEW.discount_amount, 0), COALESCE(NEW.tax_amount, 0);
  END IF;
  
  -- Additional check: if tax exists, total should be >= subtotal (after discount)
  IF COALESCE(NEW.tax_amount, 0) > 0 AND NEW.total_amount < (NEW.subtotal - COALESCE(NEW.discount_amount, 0)) THEN
    RAISE EXCEPTION 'Sale total validation failed: total (%) cannot be less than subtotal minus discount (%) when tax exists (%)',
      NEW.total_amount, (NEW.subtotal - COALESCE(NEW.discount_amount, 0)), NEW.tax_amount;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: fn_verify_post_reset_integrity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_verify_post_reset_integrity() RETURNS TABLE(check_name text, expected_value numeric, actual_value numeric, status text, details text)
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Check 1: All customer balances should be 0 if no transactions
    check_name := 'CUSTOMER_BALANCES_ZERO';
    SELECT SUM(balance) INTO actual_value FROM customers;
    actual_value := COALESCE(actual_value, 0);
    expected_value := 0;
    
    SELECT COALESCE(SUM(
        CASE 
            WHEN payment_method = 'CREDIT' AND status = 'COMPLETED' 
            THEN total_amount - COALESCE(amount_paid, 0)
            ELSE 0 
        END
    ), 0) INTO expected_value FROM sales;
    
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'FAIL' END;
    details := 'Customer balances should match outstanding credit sales';
    RETURN NEXT;
    
    -- Check 2: All supplier balances should be 0 if no GRs
    check_name := 'SUPPLIER_BALANCES_ZERO';
    SELECT SUM("OutstandingBalance") INTO actual_value FROM suppliers;
    actual_value := COALESCE(actual_value, 0);
    
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0) INTO expected_value
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gri.goods_receipt_id = gr.id
    WHERE gr.status = 'COMPLETED';
    
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'FAIL' END;
    details := 'Supplier balances should match outstanding GR values';
    RETURN NEXT;
    
    -- Check 3: All product quantities should be 0 if no batches
    check_name := 'PRODUCT_QUANTITIES_ZERO';
    SELECT SUM(quantity_on_hand) INTO actual_value FROM products;
    actual_value := COALESCE(actual_value, 0);
    
    SELECT COALESCE(SUM(remaining_quantity), 0) INTO expected_value 
    FROM inventory_batches WHERE status = 'ACTIVE';
    
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'FAIL' END;
    details := 'Product quantities should match active batch totals';
    RETURN NEXT;
    
    -- Check 4: GL accounts should be balanced
    check_name := 'GL_ACCOUNTS_BALANCED';
    SELECT SUM("CurrentBalance") INTO actual_value FROM accounts;
    actual_value := COALESCE(actual_value, 0);
    
    SELECT 
        COALESCE(SUM(CASE WHEN "EntryType" = 'DEBIT' THEN "Amount" ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN "EntryType" = 'CREDIT' THEN "Amount" ELSE 0 END), 0)
    INTO expected_value
    FROM ledger_entries;
    
    -- Note: Account balance sum should equal Debits - Credits for normal accounts
    status := CASE WHEN actual_value = expected_value THEN 'PASS' ELSE 'WARN' END;
    details := 'GL account totals should reflect ledger entries';
    RETURN NEXT;
    
    -- Check 5: No orphaned records
    check_name := 'NO_ORPHANED_RECORDS';
    SELECT COUNT(*) INTO actual_value
    FROM (
        SELECT 1 FROM sale_items si LEFT JOIN sales s ON s.id = si.sale_id WHERE s.id IS NULL
        UNION ALL
        SELECT 1 FROM goods_receipt_items gri LEFT JOIN goods_receipts gr ON gr.id = gri.goods_receipt_id WHERE gr.id IS NULL
        UNION ALL
        SELECT 1 FROM purchase_order_items poi LEFT JOIN purchase_orders po ON po.id = poi.purchase_order_id WHERE po.id IS NULL
    ) orphans;
    expected_value := 0;
    
    status := CASE WHEN actual_value = 0 THEN 'PASS' ELSE 'FAIL' END;
    details := 'No orphaned child records should exist';
    RETURN NEXT;
END;
$$;


--
-- Name: generate_backup_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_backup_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_seq := nextval('backup_number_seq');
    RETURN 'BACKUP-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;


--
-- Name: generate_cashbook_entry_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_cashbook_entry_number() RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_num INTEGER;
    year_str TEXT;
BEGIN
    year_str := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(entry_number FROM 'CB-' || year_str || '-(\d+)') AS INTEGER)
    ), 0) + 1 INTO next_num
    FROM cash_book_entries
    WHERE entry_number ~ ('^CB-' || year_str || '-\d+$');
    
    RETURN 'CB-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;


--
-- Name: generate_customer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_customer_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.customer_number IS NULL THEN
        NEW.customer_number := 'CUST-' || LPAD(nextval('customer_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_deposit_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_deposit_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.deposit_number IS NULL THEN
        NEW.deposit_number := 'DEP-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                              LPAD(nextval('deposit_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_expense_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_expense_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    year_part VARCHAR(4);
    month_part VARCHAR(2);
    sequence_num INTEGER;
    expense_number VARCHAR(50);
BEGIN
    year_part := EXTRACT(YEAR FROM NOW())::VARCHAR(4);
    month_part := LPAD(EXTRACT(MONTH FROM NOW())::VARCHAR(2), 2, '0');
    
    SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 10) AS INTEGER)), 0) + 1
    INTO sequence_num
    FROM expenses 
    WHERE expense_number LIKE 'EXP-' || year_part || month_part || '-%';
    
    expense_number := 'EXP-' || year_part || month_part || '-' || LPAD(sequence_num::VARCHAR(4), 4, '0');
    
    RETURN expense_number;
END;
$$;


--
-- Name: generate_gr_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_gr_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    year_suffix VARCHAR(4);
    next_num INTEGER;
    formatted_num VARCHAR(50);
BEGIN
    year_suffix := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Get next number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 9) AS INTEGER)), 0) + 1
    INTO next_num
    FROM goods_receipts
    WHERE receipt_number LIKE 'GR-' || year_suffix || '-%';
    
    formatted_num := 'GR-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
    
    RETURN formatted_num;
END;
$$;


--
-- Name: generate_hold_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_hold_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  current_year INTEGER;
  next_seq INTEGER;
  hold_num VARCHAR(50);
BEGIN
  current_year := EXTRACT(YEAR FROM NOW());
  next_seq := nextval('hold_number_seq');
  hold_num := 'HOLD-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN hold_num;
END;
$$;


--
-- Name: generate_invoice_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  year TEXT;
  last_number INTEGER;
  new_number VARCHAR(50);
BEGIN
  year := TO_CHAR(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 10) AS INTEGER)), 0)
  INTO last_number
  FROM invoices
  WHERE invoice_number LIKE 'INV-' || year || '-%';

  new_number := 'INV-' || year || '-' || LPAD((last_number + 1)::TEXT, 4, '0');
  RETURN new_number;
END;
$$;


--
-- Name: generate_ledger_transaction_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_ledger_transaction_number() RETURNS text
    LANGUAGE plpgsql
    AS $$
DECLARE
    next_num INTEGER;
    year_part TEXT;
BEGIN
    year_part := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Extract the numeric sequence after LT-YYYY- pattern
    SELECT COALESCE(MAX(
        CAST(SUBSTRING("TransactionNumber" FROM 'LT-' || year_part || '-([0-9]+)') AS INTEGER)
    ), 0) + 1
    INTO next_num
    FROM ledger_transactions
    WHERE "TransactionNumber" LIKE 'LT-' || year_part || '-%';
    
    RETURN 'LT-' || year_part || '-' || LPAD(next_num::TEXT, 6, '0');
END;
$$;


--
-- Name: generate_movement_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_movement_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_sequence INT;
    v_prefix VARCHAR := 'SM';
    v_year VARCHAR := TO_CHAR(CURRENT_DATE, 'YYYY');
BEGIN
    -- Get next sequence number for this year
    SELECT COALESCE(MAX(
        CASE 
            WHEN movement_number LIKE 'SM-' || v_year || '-%' THEN
                NULLIF(REGEXP_REPLACE(SUBSTRING(movement_number FROM 9), '[^0-9]', '', 'g'), '')::INT
            ELSE 0
        END
    ), 0) + 1
    INTO v_sequence
    FROM stock_movements;
    
    RETURN v_prefix || '-' || v_year || '-' || LPAD(v_sequence::TEXT, 6, '0');
END;
$$;


--
-- Name: generate_payment_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_payment_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    year TEXT;
    last_number INTEGER;
    new_number VARCHAR(50);
BEGIN
    year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(payment_number FROM 10) AS INTEGER)), 
        0
    ) INTO last_number
    FROM supplier_payments
    WHERE payment_number LIKE 'PAY-' || year || '-%';
    
    new_number := 'PAY-' || year || '-' || LPAD((last_number + 1)::TEXT, 4, '0');
    
    RETURN new_number;
END;
$$;


--
-- Name: generate_product_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_product_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.product_number IS NULL THEN
        NEW.product_number := 'PROD-' || LPAD(nextval('product_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_quote_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_quote_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.quote_number IS NULL THEN
    NEW.quote_number := 'QUOTE-' || 
                        TO_CHAR(CURRENT_DATE, 'YYYY') || '-' || 
                        LPAD(NEXTVAL('quotation_number_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: generate_receipt_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_receipt_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
  year TEXT;
  last_number INTEGER;
  new_number VARCHAR(50);
BEGIN
  year := TO_CHAR(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 11) AS INTEGER)), 0)
  INTO last_number
  FROM invoice_payments
  WHERE receipt_number LIKE 'RCPT-' || year || '-%';

  new_number := 'RCPT-' || year || '-' || LPAD((last_number + 1)::TEXT, 4, '0');
  RETURN new_number;
END;
$$;


--
-- Name: generate_reconciliation_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_reconciliation_number() RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_num INTEGER;
    year_str TEXT;
BEGIN
    year_str := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(reconciliation_number FROM 'REC-' || year_str || '-(\d+)') AS INTEGER)
    ), 0) + 1 INTO next_num
    FROM bank_reconciliations
    WHERE reconciliation_number ~ ('^REC-' || year_str || '-\d+$');
    
    RETURN 'REC-' || year_str || '-' || LPAD(next_num::TEXT, 3, '0');
END;
$_$;


--
-- Name: generate_reset_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_reset_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_year INTEGER;
    v_seq INTEGER;
BEGIN
    v_year := EXTRACT(YEAR FROM CURRENT_DATE);
    v_seq := nextval('reset_number_seq');
    RETURN 'RESET-' || v_year || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;


--
-- Name: generate_sale_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_sale_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    year_suffix VARCHAR(4);
    next_num INTEGER;
    formatted_num VARCHAR(50);
BEGIN
    year_suffix := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    -- Get next number for this year
    SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 10) AS INTEGER)), 0) + 1
    INTO next_num
    FROM sales
    WHERE sale_number LIKE 'INV-' || year_suffix || '-%';
    
    formatted_num := 'INV-' || year_suffix || '-' || LPAD(next_num::TEXT, 4, '0');
    
    RETURN formatted_num;
END;
$$;


--
-- Name: generate_supplier_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_supplier_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.supplier_number IS NULL THEN
        NEW.supplier_number := 'SUP-' || LPAD(nextval('supplier_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_tracking_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_tracking_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.tracking_number IS NULL THEN
        NEW.tracking_number = 'TRK-' || EXTRACT(YEAR FROM CURRENT_DATE) || '-' || 
                             LPAD(EXTRACT(DOY FROM CURRENT_DATE)::TEXT, 3, '0') || '-' ||
                             LPAD((EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) % 86400)::INTEGER::TEXT, 5, '0');
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: generate_transaction_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_transaction_number() RETURNS character varying
    LANGUAGE plpgsql
    AS $$
DECLARE
    year TEXT;
    last_number INTEGER;
    new_number VARCHAR(50);
BEGIN
    year := TO_CHAR(CURRENT_DATE, 'YYYY');
    
    SELECT COALESCE(
        MAX(CAST(SUBSTRING(transaction_number FROM 10) AS INTEGER)), 
        0
    ) INTO last_number
    FROM payment_transactions
    WHERE transaction_number LIKE 'TXN-' || year || '-%';
    
    new_number := 'TXN-' || year || '-' || LPAD((last_number + 1)::TEXT, 4, '0');
    
    RETURN new_number;
END;
$$;


--
-- Name: generate_transfer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_transfer_number() RETURNS text
    LANGUAGE plpgsql
    AS $_$
DECLARE
    next_num INTEGER;
    year_str TEXT;
BEGIN
    year_str := EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    
    SELECT COALESCE(MAX(
        CAST(SUBSTRING(transfer_number FROM 'TRF-' || year_str || '-(\d+)') AS INTEGER)
    ), 0) + 1 INTO next_num
    FROM cash_bank_transfers
    WHERE transfer_number ~ ('^TRF-' || year_str || '-\d+$');
    
    RETURN 'TRF-' || year_str || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$_$;


--
-- Name: log_quotation_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.log_quotation_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO quotation_status_history (
      quotation_id,
      from_status,
      to_status,
      notes,
      changed_by_id
    ) VALUES (
      NEW.id,
      OLD.status,
      NEW.status,
      'Status changed from ' || OLD.status || ' to ' || NEW.status,
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: prevent_ghost_batches(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_ghost_batches() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only allow batch creation with proper source tracking
    -- Allow GOODS_RECEIPT, STOCK_ADJUSTMENT, OPENING_BALANCE
    IF NEW.source_type IS NULL OR NEW.source_type = 'UNKNOWN' THEN
        -- Check if this is being created via GR workflow
        IF NOT EXISTS (
            SELECT 1 FROM goods_receipt_items gri 
            WHERE gri.batch_number = NEW.batch_number
        ) THEN
            RAISE NOTICE 'Batch created without GR link - marking as LEGACY: %', NEW.batch_number;
            NEW.source_type := 'DIRECT_ENTRY';
            NEW.is_verified := false;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: prevent_posted_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_posted_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only allow status changes from POSTED to REVERSED
    IF OLD."Status" = 'POSTED' AND NEW."Status" != 'REVERSED' THEN
        -- Allow updating reversal tracking columns
        IF NEW."ReversedByTransactionId" IS DISTINCT FROM OLD."ReversedByTransactionId" 
           OR NEW."ReversedAt" IS DISTINCT FROM OLD."ReversedAt"
           OR NEW."Status" = 'REVERSED' THEN
            RETURN NEW;
        END IF;
        
        RAISE EXCEPTION 'Cannot modify POSTED transaction. Use reversal instead.';
    END IF;
    
    -- Prevent any modification of REVERSED transactions
    IF OLD."Status" = 'REVERSED' THEN
        RAISE EXCEPTION 'Cannot modify REVERSED transaction.';
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: protect_computed_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_computed_balances() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Log warning but allow - balance should be updated by triggers
    IF OLD.balance IS DISTINCT FROM NEW.balance THEN
        RAISE NOTICE 'Customer balance manually changed from % to % for %. Should use proper invoice/payment workflow.',
            OLD.balance, NEW.balance, NEW.name;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: recalc_all_customer_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalc_all_customer_balances() RETURNS TABLE(customer_name character varying, old_balance numeric, new_balance numeric)
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  WITH balance_calc AS (
    SELECT 
      c.id,
      c.name,
      c.balance AS old_bal,
      COALESCE(SUM(i."OutstandingBalance"), 0) AS new_bal
    FROM customers c
    LEFT JOIN invoices i ON i."CustomerId" = c.id AND i."Status" != 'Paid'
    GROUP BY c.id, c.name, c.balance
  )
  UPDATE customers c
  SET balance = bc.new_bal
  FROM balance_calc bc
  WHERE c.id = bc.id
  RETURNING bc.name, bc.old_bal, bc.new_bal;
END;
$$;


--
-- Name: recalc_customer_balance_from_invoices(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.recalc_customer_balance_from_invoices(p_customer_id uuid) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_balance NUMERIC(15,2);
BEGIN
  -- Calculate total outstanding from all active invoices (exclude Paid and Cancelled)
  SELECT COALESCE(SUM("OutstandingBalance"), 0)
  INTO v_balance
  FROM invoices
  WHERE "CustomerId" = p_customer_id
    AND "Status" NOT IN ('Paid', 'Cancelled');
  
  -- Update customer balance
  UPDATE customers
  SET balance = v_balance
  WHERE id = p_customer_id;
  
  RETURN v_balance;
END;
$$;


--
-- Name: set_hold_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_hold_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.hold_number IS NULL OR NEW.hold_number = '' THEN
    NEW.hold_number := generate_hold_number();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_account_balance_on_ledger(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_account_balance_on_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_account_id UUID;
    v_new_balance NUMERIC(18,6);
    v_normal_balance VARCHAR(10);
BEGIN
    -- Get the affected account ID
    v_account_id := COALESCE(NEW."AccountId", OLD."AccountId");
    
    IF v_account_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Get normal balance type
    SELECT "NormalBalance" INTO v_normal_balance
    FROM accounts WHERE "Id" = v_account_id;
    
    -- Calculate new balance from all posted entries
    SELECT 
        CASE 
            WHEN v_normal_balance = 'DEBIT' THEN
                COALESCE(SUM(le."DebitAmount"), 0) - COALESCE(SUM(le."CreditAmount"), 0)
            ELSE
                COALESCE(SUM(le."CreditAmount"), 0) - COALESCE(SUM(le."DebitAmount"), 0)
        END
    INTO v_new_balance
    FROM ledger_entries le
    JOIN ledger_transactions lt ON le."LedgerTransactionId" = lt."Id"
    WHERE le."AccountId" = v_account_id
      AND lt."Status" = 'POSTED';
    
    -- Update account balance
    UPDATE accounts
    SET "CurrentBalance" = COALESCE(v_new_balance, 0),
        "UpdatedAt" = NOW()
    WHERE "Id" = v_account_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_customer_balance_on_invoice_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_customer_balance_on_invoice_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Handle INSERT and UPDATE
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM recalc_customer_balance_from_invoices(NEW."CustomerId");
    
    -- If customer changed (rare), also update old customer
    IF TG_OP = 'UPDATE' AND OLD."CustomerId" != NEW."CustomerId" THEN
      PERFORM recalc_customer_balance_from_invoices(OLD."CustomerId");
    END IF;
    
    RETURN NEW;
  END IF;
  
  -- Handle DELETE
  IF TG_OP = 'DELETE' THEN
    PERFORM recalc_customer_balance_from_invoices(OLD."CustomerId");
    RETURN OLD;
  END IF;
  
  RETURN NULL;
END;
$$;


--
-- Name: sync_customer_to_ar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_customer_to_ar() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_ar_account_id UUID;
    v_total_ar NUMERIC(18,2);
BEGIN
    -- Get AR account ID
    SELECT "Id" INTO v_ar_account_id FROM accounts WHERE "AccountCode" = '1200';
    
    IF v_ar_account_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate total AR from all active customers
    SELECT COALESCE(SUM(balance), 0) INTO v_total_ar
    FROM customers WHERE is_active = true;
    
    -- Update AR account
    UPDATE accounts
    SET "CurrentBalance" = v_total_ar,
        "UpdatedAt" = NOW()
    WHERE "Id" = v_ar_account_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_invoice_payment_to_sales_and_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_invoice_payment_to_sales_and_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_invoice_record RECORD;
  v_total_payments NUMERIC(15,2);
  v_customer_id UUID;
  v_sale_id UUID;
BEGIN
  SELECT 
    i."Id",
    i."CustomerId",
    i."SaleId",
    i."TotalAmount"
  INTO v_invoice_record
  FROM invoices i
  WHERE i."Id" = NEW.invoice_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_customer_id := v_invoice_record."CustomerId";
  v_sale_id := v_invoice_record."SaleId";

  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_payments
  FROM invoice_payments
  WHERE invoice_id = NEW.invoice_id;

  IF v_sale_id IS NOT NULL THEN
    DECLARE
      v_sale_total NUMERIC(15,2);
      v_sale_payment_method VARCHAR(50);
      v_new_payment_method VARCHAR(50);
    BEGIN
      SELECT total_amount, payment_method::text
      INTO v_sale_total, v_sale_payment_method
      FROM sales
      WHERE id = v_sale_id;
      
      IF v_sale_payment_method = 'CREDIT' AND v_total_payments >= v_sale_total THEN
        v_new_payment_method := NEW.payment_method;
      ELSE
        v_new_payment_method := v_sale_payment_method;
      END IF;
      
      UPDATE sales
      SET amount_paid = v_total_payments,
          payment_method = v_new_payment_method::payment_method
      WHERE id = v_sale_id;
    END;
  END IF;

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

  RETURN NEW;
END;
$$;


--
-- Name: sync_invoice_to_customer(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_invoice_to_customer() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_customer_id UUID;
    v_new_balance NUMERIC(18,2);
BEGIN
    -- Get customer ID
    v_customer_id := COALESCE(NEW."CustomerId", OLD."CustomerId");
    
    IF v_customer_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate total outstanding from all unpaid invoices
    SELECT COALESCE(SUM("TotalAmount" - COALESCE("AmountPaid", 0)), 0)
    INTO v_new_balance
    FROM invoices
    WHERE "CustomerId" = v_customer_id
      AND "Status" NOT IN ('PAID', 'CANCELLED');
    
    -- Update customer balance
    UPDATE customers
    SET balance = v_new_balance,
        updated_at = NOW()
    WHERE id = v_customer_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_ledger_from_journal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_ledger_from_journal() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    je_record RECORD;
BEGIN
    -- Only sync when status changes to 'POSTED' or on new POSTED entries
    IF NEW."Status" = 'POSTED' AND (OLD IS NULL OR OLD."Status" != 'POSTED') THEN
        -- Get the journal entry details
        SELECT * INTO je_record FROM journal_entries WHERE "Id" = NEW."Id";
        
        -- Insert ledger entries for each line
        INSERT INTO ledger_entries (
            "Id",
            "TransactionId",
            "AccountId",
            "EntryType",
            "Amount",
            "DebitAmount",
            "CreditAmount",
            "Description",
            "EntityId",
            "EntityType",
            "EntryDate",
            "JournalEntryLineId",
            "CreatedAt"
        )
        SELECT 
            gen_random_uuid(),
            je_record."Id",
            jel."AccountId",
            CASE 
                WHEN jel."DebitAmount" > 0 THEN 'DEBIT'
                ELSE 'CREDIT'
            END,
            GREATEST(jel."DebitAmount", jel."CreditAmount"),
            jel."DebitAmount",
            jel."CreditAmount",
            jel."Description",
            jel."EntityId",
            jel."EntityType",
            je_record."EntryDate",
            jel."Id",
            NOW()
        FROM journal_entry_lines jel
        WHERE jel."JournalEntryId" = NEW."Id"
        ON CONFLICT DO NOTHING;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: sync_po_payment_amounts(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_po_payment_amounts() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE purchase_orders
    SET 
        paid_amount = COALESCE((
            SELECT SUM(paid_amount)
            FROM supplier_payments
            WHERE purchase_order_id = NEW.purchase_order_id
        ), 0),
        outstanding_amount = COALESCE((
            SELECT SUM(outstanding_amount)
            FROM supplier_payments
            WHERE purchase_order_id = NEW.purchase_order_id
        ), 0),
        payment_status = NEW.payment_status
    WHERE id = NEW.purchase_order_id;
    
    RETURN NEW;
END;
$$;


--
-- Name: sync_supplier_balance_on_gr(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_balance_on_gr() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier_id UUID;
    v_gr_total NUMERIC(18,6);
    v_payment_total NUMERIC(18,6);
    v_new_balance NUMERIC(18,6);
BEGIN
    -- Get supplier from the goods receipt -> PO chain
    SELECT po.supplier_id INTO v_supplier_id
    FROM goods_receipts gr
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE gr.id = COALESCE(NEW.goods_receipt_id, OLD.goods_receipt_id);
    
    IF v_supplier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate total goods received for this supplier
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_gr_total
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = v_supplier_id
      AND gr.status = 'COMPLETED';
    
    -- Calculate total payments for this supplier
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_payment_total
    FROM supplier_payments
    WHERE "SupplierId" = v_supplier_id
      AND "Status" = 'COMPLETED';
    
    -- Calculate new balance
    v_new_balance := v_gr_total - v_payment_total;
    
    -- Update supplier balance
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = NOW()
    WHERE "Id" = v_supplier_id;
    
    RAISE NOTICE 'Supplier % balance updated to % (GR: %, Paid: %)', 
        v_supplier_id, v_new_balance, v_gr_total, v_payment_total;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_supplier_balance_on_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_balance_on_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier_id UUID;
    v_gr_total NUMERIC(18,6);
    v_payment_total NUMERIC(18,6);
    v_new_balance NUMERIC(18,6);
BEGIN
    -- Get supplier ID from the payment
    v_supplier_id := COALESCE(NEW."SupplierId", OLD."SupplierId");
    
    IF v_supplier_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;
    
    -- Calculate total goods received for this supplier
    SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
    INTO v_gr_total
    FROM goods_receipts gr
    JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
    JOIN purchase_orders po ON gr.purchase_order_id = po.id
    WHERE po.supplier_id = v_supplier_id
      AND gr.status = 'COMPLETED';
    
    -- Calculate total payments for this supplier
    SELECT COALESCE(SUM("Amount"), 0)
    INTO v_payment_total
    FROM supplier_payments
    WHERE "SupplierId" = v_supplier_id
      AND "Status" = 'COMPLETED';
    
    -- Calculate new balance
    v_new_balance := v_gr_total - v_payment_total;
    
    -- Update supplier balance
    UPDATE suppliers
    SET "OutstandingBalance" = v_new_balance,
        "UpdatedAt" = NOW()
    WHERE "Id" = v_supplier_id;
    
    RAISE NOTICE 'Supplier % balance updated to % (GR: %, Paid: %)', 
        v_supplier_id, v_new_balance, v_gr_total, v_payment_total;
    
    RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_supplier_on_gr_complete(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_on_gr_complete() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_supplier_id UUID;
    v_gr_total NUMERIC(18,6);
    v_payment_total NUMERIC(18,6);
    v_new_balance NUMERIC(18,6);
BEGIN
    -- Only act when status changes TO 'COMPLETED'
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        -- Get supplier from PO
        SELECT po.supplier_id INTO v_supplier_id
        FROM purchase_orders po
        WHERE po.id = NEW.purchase_order_id;
        
        IF v_supplier_id IS NOT NULL THEN
            -- Calculate total goods received for this supplier
            SELECT COALESCE(SUM(gri.received_quantity * gri.cost_price), 0)
            INTO v_gr_total
            FROM goods_receipts gr
            JOIN goods_receipt_items gri ON gr.id = gri.goods_receipt_id
            JOIN purchase_orders po ON gr.purchase_order_id = po.id
            WHERE po.supplier_id = v_supplier_id
              AND gr.status = 'COMPLETED';
            
            -- Calculate total payments for this supplier
            SELECT COALESCE(SUM("Amount"), 0)
            INTO v_payment_total
            FROM supplier_payments
            WHERE "SupplierId" = v_supplier_id
              AND "Status" = 'COMPLETED';
            
            -- Calculate and update
            v_new_balance := v_gr_total - v_payment_total;
            
            UPDATE suppliers
            SET "OutstandingBalance" = v_new_balance,
                "UpdatedAt" = NOW()
            WHERE "Id" = v_supplier_id;
            
            RAISE NOTICE 'GR Complete: Supplier % balance = %', v_supplier_id, v_new_balance;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: track_delivery_status_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.track_delivery_status_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Only track if status actually changed
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO delivery_status_history (
            delivery_order_id,
            old_status,
            new_status,
            changed_by_id,
            notes
        ) VALUES (
            NEW.id,
            OLD.status,
            NEW.status,
            NEW.updated_by_id,
            'Status changed from ' || COALESCE(OLD.status, 'NULL') || ' to ' || NEW.status
        );
        
        -- Set completion timestamp when delivered
        IF NEW.status = 'DELIVERED' THEN
            NEW.completed_at = CURRENT_TIMESTAMP;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: trg_enforce_open_period_manual_je(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_enforce_open_period_manual_je() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NOT fn_is_period_open(NEW.entry_date) THEN
        RAISE EXCEPTION 'Cannot post to closed period. Entry date: %', NEW.entry_date;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_set_cashbook_entry_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_set_cashbook_entry_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.entry_number IS NULL OR NEW.entry_number = '' THEN
        NEW.entry_number := generate_cashbook_entry_number();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_set_reconciliation_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_set_reconciliation_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.reconciliation_number IS NULL OR NEW.reconciliation_number = '' THEN
        NEW.reconciliation_number := generate_reconciliation_number();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_set_transfer_number(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_set_transfer_number() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.transfer_number IS NULL OR NEW.transfer_number = '' THEN
        NEW.transfer_number := generate_transfer_number();
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: trg_update_cashbook_running_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_update_cashbook_running_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    current_balance NUMERIC(15,2);
BEGIN
    -- Get current account balance
    SELECT current_balance INTO current_balance 
    FROM bank_accounts 
    WHERE id = NEW.bank_account_id;
    
    -- Calculate new running balance
    IF NEW.entry_type = 'RECEIPT' THEN
        NEW.running_balance := current_balance + NEW.amount;
        -- Update account balance
        UPDATE bank_accounts 
        SET current_balance = current_balance + NEW.amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.bank_account_id;
    ELSE -- PAYMENT
        NEW.running_balance := current_balance - NEW.amount;
        -- Update account balance
        UPDATE bank_accounts 
        SET current_balance = current_balance - NEW.amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.bank_account_id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: trg_update_transfer_balances(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_update_transfer_balances() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
        -- Debit from account (decrease balance)
        UPDATE bank_accounts 
        SET current_balance = current_balance - (NEW.transfer_amount + NEW.transfer_fee),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.from_account_id;
        
        -- Credit to account (increase balance)
        UPDATE bank_accounts 
        SET current_balance = current_balance + NEW.transfer_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = NEW.to_account_id;
        
    ELSIF OLD.status = 'COMPLETED' AND NEW.status != 'COMPLETED' THEN
        -- Reverse the transfer (cancellation)
        UPDATE bank_accounts 
        SET current_balance = current_balance + (OLD.transfer_amount + OLD.transfer_fee),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.from_account_id;
        
        UPDATE bank_accounts 
        SET current_balance = current_balance - OLD.transfer_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = OLD.to_account_id;
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: update_cost_layers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_cost_layers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_customer_groups_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_customer_groups_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_delivery_timestamps(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_delivery_timestamps() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_deposit_status_and_available(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_deposit_status_and_available() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Update amount_available
    NEW.amount_available := NEW.amount - NEW.amount_used;
    
    -- Update status based on remaining balance
    IF NEW.amount_available <= 0 THEN
        NEW.status := 'DEPLETED';
    ELSIF NEW.status = 'DEPLETED' AND NEW.amount_available > 0 THEN
        -- Reverting a depleted deposit back to active (e.g., voided sale)
        NEW.status := 'ACTIVE';
    END IF;
    
    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$;


--
-- Name: update_expense_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_expense_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_invoice_totals_after_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_invoice_totals_after_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Note: invoices table uses PascalCase columns (EF Core convention)
  UPDATE invoices
  SET "AmountPaid" = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0),
      "OutstandingBalance" = GREATEST("TotalAmount" - COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0), 0),
      "Status" = CASE 
        WHEN COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0) >= "TotalAmount" THEN 'Paid'
        WHEN COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = NEW.invoice_id), 0) > 0 THEN 'PartiallyPaid'
        ELSE 'Unpaid'
      END,
      "UpdatedAt" = NOW()
  WHERE "Id" = NEW.invoice_id;
  RETURN NEW;
END;
$$;


--
-- Name: update_outstanding_amount(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_outstanding_amount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.outstanding_amount := NEW.invoice_amount - NEW.paid_amount - NEW.discount_amount;
    
    -- Update payment status based on amounts
    IF NEW.paid_amount >= NEW.invoice_amount - NEW.discount_amount THEN
        NEW.payment_status := 'PAID';
    ELSIF NEW.paid_amount > 0 THEN
        NEW.payment_status := 'PARTIAL';
    ELSIF NEW.due_date < CURRENT_DATE AND NEW.paid_amount = 0 THEN
        NEW.payment_status := 'OVERDUE';
    ELSE
        NEW.payment_status := 'PENDING';
    END IF;
    
    RETURN NEW;
END;
$$;


--
-- Name: update_pricing_tiers_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_pricing_tiers_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_quotation_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_quotation_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_session_activity(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_session_activity() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    UPDATE user_sessions
    SET 
        last_activity_at = NOW(),
        actions_count = actions_count + 1,
        updated_at = NOW()
    WHERE id = NEW.session_id AND is_active = true;
    RETURN NEW;
END;
$$;


--
-- Name: update_session_duration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_session_duration() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.logout_at IS NOT NULL AND OLD.logout_at IS NULL THEN
        NEW.session_duration_seconds := EXTRACT(EPOCH FROM (NEW.logout_at - NEW.login_at))::INT;
        NEW.is_active := false;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_stock_count_lines_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_stock_count_lines_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: update_supplier_invoice_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_supplier_invoice_status() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.paid_amount >= NEW.total_amount THEN
        NEW.status := 'PAID';
    ELSIF NEW.paid_amount > 0 THEN
        NEW.status := 'PARTIAL';
    ELSIF NEW.due_date IS NOT NULL AND NEW.due_date < CURRENT_DATE AND NEW.status NOT IN ('PAID', 'CANCELLED') THEN
        NEW.status := 'OVERDUE';
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: update_system_settings_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_system_settings_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;


--
-- Name: validate_expense_status_transition(character varying, character varying, character varying); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_expense_status_transition(current_status character varying, new_status character varying, user_role character varying) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Draft can go to pending approval or cancelled
    IF current_status = 'DRAFT' THEN
        RETURN new_status IN ('PENDING_APPROVAL', 'CANCELLED');
    END IF;
    
    -- Pending approval can be approved/rejected (by MANAGER/ADMIN) or cancelled
    IF current_status = 'PENDING_APPROVAL' THEN
        IF user_role IN ('MANAGER', 'ADMIN') THEN
            RETURN new_status IN ('APPROVED', 'REJECTED', 'CANCELLED');
        ELSE
            RETURN new_status = 'CANCELLED';
        END IF;
    END IF;
    
    -- Approved can go to paid or cancelled (by ADMIN)
    IF current_status = 'APPROVED' THEN
        IF user_role = 'ADMIN' THEN
            RETURN new_status IN ('PAID', 'CANCELLED');
        ELSE
            RETURN false;
        END IF;
    END IF;
    
    -- Paid and cancelled are final states
    IF current_status IN ('PAID', 'CANCELLED', 'REJECTED') THEN
        RETURN false;
    END IF;
    
    RETURN false;
END;
$$;


--
-- Name: validate_gr_finalization(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_gr_finalization() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  missing_links INTEGER;
  po_id UUID;
BEGIN
  -- Only check when status changes to COMPLETED
  IF NEW.status = 'COMPLETED' AND (OLD.status IS NULL OR OLD.status != 'COMPLETED') THEN
    
    -- Get the PO id for this GR
    po_id := NEW.purchase_order_id;
    
    -- If GR is linked to a PO, ensure all items have po_item_id
    IF po_id IS NOT NULL THEN
      SELECT COUNT(*) INTO missing_links
      FROM goods_receipt_items gri
      WHERE gri.goods_receipt_id = NEW.id
        AND gri.po_item_id IS NULL
        AND gri.received_quantity > 0;
      
      IF missing_links > 0 THEN
        RAISE EXCEPTION 
          'Cannot finalize GR %: % items missing po_item_id link. This will break PO status tracking.',
          NEW.receipt_number, missing_links
          USING HINT = 'Run the auto-fix script: UPDATE goods_receipt_items SET po_item_id = (SELECT poi.id FROM purchase_order_items poi WHERE poi.purchase_order_id = ''' || po_id || ''' AND poi.product_id = goods_receipt_items.product_id LIMIT 1) WHERE goods_receipt_id = ''' || NEW.id || ''' AND po_item_id IS NULL';
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: validate_period_open(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_period_open() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_is_closed BOOLEAN;
BEGIN
    SELECT is_closed INTO v_is_closed
    FROM financial_periods
    WHERE NEW."TransactionDate" BETWEEN start_date AND end_date
    LIMIT 1;
    
    -- If no period exists or period is not closed, allow the transaction
    IF v_is_closed IS NULL OR v_is_closed = FALSE THEN
        RETURN NEW;
    END IF;
    
    -- If period is closed, raise an error
    RAISE EXCEPTION 'Cannot post to a closed period';
END;
$$;


--
-- Name: validate_sale_payment(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_sale_payment() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    -- Ensure amount_paid doesn't exceed total_amount significantly
    -- Note: For refunds, use a separate refund workflow, not a sale with REFUND payment method
    -- Allow small rounding differences (0.01)
    IF NEW.amount_paid > NEW.total_amount + 0.01 THEN
        RAISE WARNING 'Sale % has amount_paid (%) > total_amount (%). This may indicate overpayment or change calculation issue.',
            NEW.sale_number, NEW.amount_paid, NEW.total_amount;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: validate_transaction_balance(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validate_transaction_balance() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    balance_diff NUMERIC;
BEGIN
    -- Allow small rounding differences (0.001)
    balance_diff := ABS(NEW."TotalDebitAmount" - NEW."TotalCreditAmount");
    
    IF balance_diff > 0.001 THEN
        RAISE EXCEPTION 'Double-entry violation: Debits (%) â‰  Credits (%). Difference: %',
            NEW."TotalDebitAmount", NEW."TotalCreditAmount", balance_diff;
    END IF;
    
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __EFMigrationsHistory; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."__EFMigrationsHistory" (
    "MigrationId" character varying(150) NOT NULL,
    "ProductVersion" character varying(32) NOT NULL
);


--
-- Name: accounting_period_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_period_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_id uuid NOT NULL,
    action character varying(20) NOT NULL,
    performed_by uuid,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    previous_status character varying(20),
    new_status character varying(20) NOT NULL,
    CONSTRAINT accounting_period_history_action_check CHECK (((action)::text = ANY ((ARRAY['CREATED'::character varying, 'CLOSED'::character varying, 'REOPENED'::character varying, 'LOCKED'::character varying])::text[])))
);


--
-- Name: accounting_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounting_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_year integer NOT NULL,
    period_month integer NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
    closed_at timestamp with time zone,
    closed_by uuid,
    close_notes text,
    reopened_at timestamp with time zone,
    reopened_by uuid,
    reopen_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT accounting_periods_period_month_check CHECK (((period_month >= 1) AND (period_month <= 12))),
    CONSTRAINT accounting_periods_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying, 'LOCKED'::character varying])::text[])))
);


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    "Id" uuid NOT NULL,
    "AccountCode" character varying(20) NOT NULL,
    "AccountName" character varying(200) NOT NULL,
    "AccountType" character varying(20) NOT NULL,
    "NormalBalance" character varying(10) NOT NULL,
    "ParentAccountId" uuid,
    "Level" integer NOT NULL,
    "IsPostingAccount" boolean NOT NULL,
    "IsActive" boolean NOT NULL,
    "Description" character varying(500),
    "CurrentBalance" numeric(18,6) NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "AccountClassification" character varying(50),
    "AllowAutomatedPosting" boolean DEFAULT true NOT NULL,
    "EventTypeMapping" jsonb
);


--
-- Name: approval_limits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approval_limits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    role character varying(50) NOT NULL,
    max_amount numeric(15,2) NOT NULL,
    requires_additional_approval boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid,
    entity_number character varying(100),
    action character varying(50) NOT NULL,
    action_details text,
    user_id uuid NOT NULL,
    user_name character varying(255),
    user_role character varying(50),
    old_values jsonb,
    new_values jsonb,
    changes jsonb,
    ip_address inet,
    user_agent text,
    session_id uuid,
    request_id uuid,
    severity character varying(20) DEFAULT 'INFO'::character varying,
    category character varying(50),
    tags text[],
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    reference_number character varying(100),
    CONSTRAINT audit_log_action_check CHECK (((action)::text = ANY ((ARRAY['CREATE'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'VOID'::character varying, 'CANCEL'::character varying, 'REFUND'::character varying, 'EXCHANGE'::character varying, 'LOGIN'::character varying, 'LOGOUT'::character varying, 'LOGIN_FAILED'::character varying, 'PASSWORD_CHANGE'::character varying, 'PERMISSION_CHANGE'::character varying, 'APPROVE'::character varying, 'REJECT'::character varying, 'RESTORE'::character varying, 'ARCHIVE'::character varying, 'EXPORT'::character varying, 'IMPORT'::character varying, 'OPEN_DRAWER'::character varying, 'CLOSE_SHIFT'::character varying, 'ADJUST_INVENTORY'::character varying, 'PRICE_CHANGE'::character varying])::text[]))),
    CONSTRAINT audit_log_entity_type_check CHECK (((entity_type)::text = ANY ((ARRAY['SALE'::character varying, 'INVOICE'::character varying, 'PAYMENT'::character varying, 'PRODUCT'::character varying, 'CUSTOMER'::character varying, 'SUPPLIER'::character varying, 'USER'::character varying, 'PURCHASE_ORDER'::character varying, 'GOODS_RECEIPT'::character varying, 'INVENTORY_ADJUSTMENT'::character varying, 'BATCH'::character varying, 'PRICING'::character varying, 'SETTINGS'::character varying, 'REPORT'::character varying, 'SYSTEM'::character varying])::text[]))),
    CONSTRAINT audit_log_severity_check CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'ERROR'::character varying, 'CRITICAL'::character varying])::text[])))
);


--
-- Name: TABLE audit_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.audit_log IS 'Comprehensive audit trail for all system operations';


--
-- Name: COLUMN audit_log.entity_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.entity_type IS 'Type of entity being audited';


--
-- Name: COLUMN audit_log.entity_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.entity_id IS 'UUID of the entity (internal reference)';


--
-- Name: COLUMN audit_log.entity_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.entity_number IS 'Human-readable business identifier';


--
-- Name: COLUMN audit_log.action; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.action IS 'Action performed on the entity';


--
-- Name: COLUMN audit_log.old_values; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.old_values IS 'Entity state before change (for UPDATE/DELETE)';


--
-- Name: COLUMN audit_log.new_values; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.new_values IS 'Entity state after change (for CREATE/UPDATE)';


--
-- Name: COLUMN audit_log.changes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.audit_log.changes IS 'Calculated diff showing only changed fields';


--
-- Name: backup_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.backup_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_code character varying(20) NOT NULL,
    account_name character varying(200) NOT NULL,
    account_type character varying(20) NOT NULL,
    bank_name character varying(200),
    account_number character varying(100),
    currency_code character varying(3) DEFAULT 'UGX'::character varying NOT NULL,
    opening_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    current_balance numeric(15,2) DEFAULT 0.00 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_main_cash boolean DEFAULT false NOT NULL,
    is_main_bank boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by uuid,
    is_default boolean DEFAULT false,
    gl_account_id uuid NOT NULL,
    name character varying(100),
    branch character varying(100),
    last_reconciled_balance numeric(18,2),
    last_reconciled_at timestamp with time zone,
    low_balance_threshold numeric(18,2) DEFAULT 0,
    low_balance_alert_enabled boolean DEFAULT false,
    notes text,
    CONSTRAINT bank_accounts_account_type_check CHECK (((account_type)::text = ANY ((ARRAY['CASH'::character varying, 'BANK'::character varying, 'PETTY_CASH'::character varying])::text[])))
);


--
-- Name: TABLE bank_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_accounts IS 'Physical bank accounts linked to GL accounts. Balance is derived from General Ledger (not stored here).';


--
-- Name: COLUMN bank_accounts.current_balance; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.current_balance IS 'DEPRECATED: Use v_bank_account_balances view for GL-derived balance.';


--
-- Name: COLUMN bank_accounts.gl_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.gl_account_id IS 'Links this bank account to its GL account. Balance is derived from ledger_entries.';


--
-- Name: COLUMN bank_accounts.low_balance_threshold; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.low_balance_threshold IS 'Threshold for low balance alerts';


--
-- Name: COLUMN bank_accounts.low_balance_alert_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.low_balance_alert_enabled IS 'Whether low balance alerts are enabled';


--
-- Name: COLUMN bank_accounts.notes; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.bank_accounts.notes IS 'Additional notes about the account';


--
-- Name: bank_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bank_account_id uuid,
    transaction_id uuid,
    statement_line_id uuid,
    alert_type character varying(50) NOT NULL,
    severity character varying(20) DEFAULT 'WARNING'::character varying,
    message text NOT NULL,
    details jsonb,
    status character varying(20) DEFAULT 'NEW'::character varying,
    resolution_notes character varying(500),
    reviewed_by character varying(100),
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_alerts_alert_type_check CHECK (((alert_type)::text = ANY ((ARRAY['UNUSUAL_AMOUNT'::character varying, 'DUPLICATE_SUSPECTED'::character varying, 'UNRECOGNIZED'::character varying, 'LOW_BALANCE'::character varying, 'OVERDUE_RECURRING'::character varying, 'RECONCILIATION_DIFFERENCE'::character varying])::text[]))),
    CONSTRAINT bank_alerts_severity_check CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'WARNING'::character varying, 'CRITICAL'::character varying])::text[]))),
    CONSTRAINT bank_alerts_status_check CHECK (((status)::text = ANY ((ARRAY['NEW'::character varying, 'REVIEWED'::character varying, 'DISMISSED'::character varying, 'RESOLVED'::character varying])::text[])))
);


--
-- Name: TABLE bank_alerts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_alerts IS 'Alerts for unusual activity, duplicates, reconciliation issues.';


--
-- Name: bank_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    name character varying(100) NOT NULL,
    direction character varying(10) NOT NULL,
    default_account_id uuid,
    is_system boolean DEFAULT false,
    is_active boolean DEFAULT true,
    display_order integer DEFAULT 100,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_categories_direction_check CHECK (((direction)::text = ANY ((ARRAY['IN'::character varying, 'OUT'::character varying])::text[])))
);


--
-- Name: TABLE bank_categories; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_categories IS 'Pre-defined categories for quick transaction classification.';


--
-- Name: bank_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    description_pattern character varying(500) NOT NULL,
    pattern_type character varying(20) DEFAULT 'CONTAINS'::character varying,
    category_id uuid,
    category_name character varying(100),
    account_id uuid,
    priority integer DEFAULT 0,
    transaction_type character varying(10),
    confidence numeric(3,2) DEFAULT 0.50,
    match_count integer DEFAULT 0,
    success_count integer DEFAULT 0,
    notes text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_patterns_pattern_type_check CHECK (((pattern_type)::text = ANY ((ARRAY['CONTAINS'::character varying, 'REGEX'::character varying, 'EXACT'::character varying])::text[]))),
    CONSTRAINT bank_patterns_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['CREDIT'::character varying, 'DEBIT'::character varying])::text[])))
);


--
-- Name: bank_reconciliation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_reconciliation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reconciliation_id uuid NOT NULL,
    transaction_type character varying(30) NOT NULL,
    reference_number character varying(100),
    transaction_date date NOT NULL,
    amount numeric(15,2) NOT NULL,
    description text NOT NULL,
    is_cleared boolean DEFAULT false NOT NULL,
    cleared_date date,
    notes text,
    CONSTRAINT bank_reconciliation_items_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['OUTSTANDING_DEPOSIT'::character varying, 'OUTSTANDING_WITHDRAWAL'::character varying, 'BANK_CHARGE'::character varying, 'BANK_INTEREST'::character varying, 'ERROR_CORRECTION'::character varying])::text[])))
);


--
-- Name: bank_reconciliations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_reconciliations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reconciliation_number character varying(50) NOT NULL,
    bank_account_id uuid NOT NULL,
    reconciliation_date date NOT NULL,
    statement_date date NOT NULL,
    book_balance numeric(15,2) NOT NULL,
    bank_balance numeric(15,2) NOT NULL,
    reconciled_balance numeric(15,2),
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    reconciled_by uuid NOT NULL,
    reviewed_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp with time zone,
    notes text,
    CONSTRAINT bank_reconciliations_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'COMPLETED'::character varying, 'REVIEWED'::character varying])::text[])))
);


--
-- Name: TABLE bank_reconciliations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_reconciliations IS 'Tracks bank statement reconciliation process';


--
-- Name: bank_recurring_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_recurring_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    bank_account_id uuid,
    match_rules jsonb NOT NULL,
    frequency character varying(20),
    expected_day integer,
    expected_amount numeric(18,2),
    tolerance_percent integer DEFAULT 10,
    category_id uuid,
    contra_account_id uuid,
    last_matched_at timestamp with time zone,
    last_matched_amount numeric(18,2),
    next_expected_at date,
    miss_count integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_recurring_rules_frequency_check CHECK (((frequency)::text = ANY ((ARRAY['WEEKLY'::character varying, 'BIWEEKLY'::character varying, 'MONTHLY'::character varying, 'QUARTERLY'::character varying, 'YEARLY'::character varying])::text[])))
);


--
-- Name: TABLE bank_recurring_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_recurring_rules IS 'Expected recurring transactions (rent, salaries, etc.).';


--
-- Name: bank_statement_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statement_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_id uuid NOT NULL,
    line_number integer NOT NULL,
    transaction_date date,
    description character varying(500),
    reference character varying(100),
    amount numeric(18,2) NOT NULL,
    running_balance numeric(18,2),
    match_status character varying(20) DEFAULT 'UNMATCHED'::character varying,
    matched_transaction_id uuid,
    match_confidence integer,
    suggested_category_id uuid,
    suggested_account_id uuid,
    processed_at timestamp with time zone,
    processed_by character varying(100),
    skip_reason character varying(255),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_statement_lines_match_status_check CHECK (((match_status)::text = ANY ((ARRAY['UNMATCHED'::character varying, 'MATCHED'::character varying, 'CREATED'::character varying, 'SKIPPED'::character varying])::text[])))
);


--
-- Name: TABLE bank_statement_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_statement_lines IS 'Individual lines from imported statements. Matched to bank_transactions.';


--
-- Name: bank_statements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_statements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    statement_number character varying(50) NOT NULL,
    bank_account_id uuid NOT NULL,
    statement_date date NOT NULL,
    period_start date,
    period_end date,
    opening_balance numeric(18,2),
    closing_balance numeric(18,2),
    file_name character varying(255),
    template_id uuid,
    total_lines integer DEFAULT 0,
    matched_lines integer DEFAULT 0,
    created_lines integer DEFAULT 0,
    skipped_lines integer DEFAULT 0,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    imported_by character varying(100),
    imported_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    CONSTRAINT bank_statements_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: TABLE bank_statements; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_statements IS 'Imported bank statements. Tracks reconciliation progress.';


--
-- Name: bank_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    bank_name character varying(100),
    column_mappings jsonb NOT NULL,
    skip_header_rows integer DEFAULT 1,
    skip_footer_rows integer DEFAULT 0,
    delimiter character varying(5) DEFAULT ','::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE bank_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_templates IS 'CSV import templates per bank. Configure once, reuse for all imports.';


--
-- Name: bank_transaction_patterns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transaction_patterns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100),
    match_rules jsonb NOT NULL,
    category_id uuid,
    contra_account_id uuid,
    confidence integer DEFAULT 50,
    times_used integer DEFAULT 0,
    times_rejected integer DEFAULT 0,
    last_used_at timestamp with time zone,
    auto_apply_threshold integer DEFAULT 90,
    is_system boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_transaction_patterns_confidence_check CHECK (((confidence >= 0) AND (confidence <= 100)))
);


--
-- Name: TABLE bank_transaction_patterns; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_transaction_patterns IS 'Learned patterns from user categorizations. Confidence increases with use.';


--
-- Name: bank_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_number character varying(50) NOT NULL,
    bank_account_id uuid NOT NULL,
    transaction_date date NOT NULL,
    type character varying(20) NOT NULL,
    category_id uuid,
    description character varying(500) NOT NULL,
    reference character varying(100),
    amount numeric(18,2) NOT NULL,
    running_balance numeric(18,2),
    contra_account_id uuid,
    gl_transaction_id uuid,
    source_type character varying(50),
    source_id uuid,
    statement_line_id uuid,
    matched_at timestamp with time zone,
    match_confidence integer,
    is_reconciled boolean DEFAULT false,
    reconciled_at timestamp with time zone,
    reconciled_by character varying(100),
    transfer_pair_id uuid,
    is_reversed boolean DEFAULT false,
    reversed_at timestamp with time zone,
    reversed_by character varying(100),
    reversal_reason character varying(500),
    reversal_transaction_id uuid,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bank_transactions_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT bank_transactions_match_confidence_check CHECK (((match_confidence >= 0) AND (match_confidence <= 100))),
    CONSTRAINT bank_transactions_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['SALE'::character varying, 'EXPENSE'::character varying, 'CUSTOMER_PAYMENT'::character varying, 'SUPPLIER_PAYMENT'::character varying, 'STATEMENT_IMPORT'::character varying, 'MANUAL'::character varying, 'TRANSFER'::character varying])::text[]))),
    CONSTRAINT bank_transactions_type_check CHECK (((type)::text = ANY ((ARRAY['DEPOSIT'::character varying, 'WITHDRAWAL'::character varying, 'TRANSFER_IN'::character varying, 'TRANSFER_OUT'::character varying, 'FEE'::character varying, 'INTEREST'::character varying])::text[])))
);


--
-- Name: TABLE bank_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.bank_transactions IS 'All bank transactions. Every transaction posts to GL. Immutable - reversals create new entries.';


--
-- Name: bank_txn_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bank_txn_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cash_bank_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_bank_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transfer_number character varying(50) NOT NULL,
    transfer_type character varying(20) NOT NULL,
    from_account_id uuid NOT NULL,
    to_account_id uuid NOT NULL,
    transfer_amount numeric(15,2) NOT NULL,
    transfer_fee numeric(15,2) DEFAULT 0.00 NOT NULL,
    transfer_date date DEFAULT CURRENT_DATE NOT NULL,
    reference_number character varying(100),
    description text,
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_by uuid NOT NULL,
    CONSTRAINT cash_bank_transfers_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT cash_bank_transfers_transfer_amount_check CHECK ((transfer_amount > (0)::numeric)),
    CONSTRAINT cash_bank_transfers_transfer_type_check CHECK (((transfer_type)::text = ANY ((ARRAY['CASH_TO_BANK'::character varying, 'BANK_TO_CASH'::character varying, 'BANK_TO_BANK'::character varying, 'CASH_TO_CASH'::character varying])::text[]))),
    CONSTRAINT chk_approved_when_completed CHECK (((((status)::text = 'COMPLETED'::text) AND (approved_by IS NOT NULL) AND (approved_at IS NOT NULL)) OR ((status)::text <> 'COMPLETED'::text))),
    CONSTRAINT chk_different_accounts CHECK ((from_account_id <> to_account_id))
);


--
-- Name: TABLE cash_bank_transfers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_bank_transfers IS 'Records transfers between cash and bank accounts';


--
-- Name: cash_book_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_book_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number character varying(50) NOT NULL,
    bank_account_id uuid NOT NULL,
    entry_date date DEFAULT CURRENT_DATE NOT NULL,
    entry_type character varying(20) NOT NULL,
    transaction_type character varying(30) NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference_number character varying(100),
    counterparty character varying(200),
    description text NOT NULL,
    voucher_number character varying(50),
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    running_balance numeric(15,2),
    CONSTRAINT cash_book_entries_amount_check CHECK ((amount <> (0)::numeric)),
    CONSTRAINT cash_book_entries_entry_type_check CHECK (((entry_type)::text = ANY ((ARRAY['RECEIPT'::character varying, 'PAYMENT'::character varying])::text[]))),
    CONSTRAINT cash_book_entries_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['SALES_RECEIPT'::character varying, 'PAYMENT_RECEIVED'::character varying, 'BANK_DEPOSIT'::character varying, 'SUPPLIER_PAYMENT'::character varying, 'EXPENSE_PAYMENT'::character varying, 'BANK_WITHDRAWAL'::character varying, 'TRANSFER_IN'::character varying, 'TRANSFER_OUT'::character varying, 'ADJUSTMENT'::character varying])::text[])))
);


--
-- Name: TABLE cash_book_entries; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cash_book_entries IS 'Daily cash book for receipts and payments tracking';


--
-- Name: cash_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_movements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    user_id uuid NOT NULL,
    movement_type character varying(20) NOT NULL,
    amount numeric(15,2) NOT NULL,
    reason character varying(255),
    reference_type character varying(50),
    reference_id uuid,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    payment_method character varying(50),
    CONSTRAINT cash_movements_movement_type_check CHECK (((movement_type)::text = ANY ((ARRAY['CASH_IN'::character varying, 'CASH_IN_FLOAT'::character varying, 'CASH_IN_PAYMENT'::character varying, 'CASH_IN_OTHER'::character varying, 'CASH_OUT'::character varying, 'CASH_OUT_BANK'::character varying, 'CASH_OUT_EXPENSE'::character varying, 'CASH_OUT_OTHER'::character varying, 'SALE'::character varying, 'REFUND'::character varying, 'FLOAT_ADJUSTMENT'::character varying])::text[])))
);


--
-- Name: cash_register_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_register_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    register_id uuid NOT NULL,
    user_id uuid NOT NULL,
    session_number character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'OPEN'::character varying,
    opening_float numeric(15,2) DEFAULT 0 NOT NULL,
    expected_closing numeric(15,2),
    actual_closing numeric(15,2),
    variance numeric(15,2),
    variance_reason text,
    opened_at timestamp with time zone DEFAULT now(),
    closed_at timestamp with time zone,
    reconciled_at timestamp with time zone,
    reconciled_by uuid,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    blind_count_enabled boolean DEFAULT false,
    denomination_breakdown jsonb,
    payment_summary jsonb,
    variance_approved_by uuid,
    variance_approved_at timestamp with time zone,
    variance_threshold numeric(15,2) DEFAULT 0,
    CONSTRAINT cash_register_sessions_status_check CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying, 'RECONCILED'::character varying])::text[])))
);


--
-- Name: COLUMN cash_register_sessions.blind_count_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cash_register_sessions.blind_count_enabled IS 'When true, cashier cannot see expected closing before entering actual count';


--
-- Name: COLUMN cash_register_sessions.denomination_breakdown; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cash_register_sessions.denomination_breakdown IS 'JSON object tracking cash by denomination: {100: 5, 50: 10, ...}';


--
-- Name: COLUMN cash_register_sessions.payment_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cash_register_sessions.payment_summary IS 'Summary by payment method: {CASH: 5000, CARD: 2000, MOBILE_MONEY: 1000}';


--
-- Name: cash_registers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cash_registers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    location character varying(255),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: cost_layers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cost_layers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(15,4) NOT NULL,
    remaining_quantity numeric(15,4) NOT NULL,
    unit_cost numeric(15,2) NOT NULL,
    received_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    batch_number character varying(100),
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    goods_receipt_id uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    gl_transaction_id uuid
);


--
-- Name: TABLE cost_layers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.cost_layers IS 'Tracks inventory cost valuation layers for FIFO/AVCO costing methods';


--
-- Name: COLUMN cost_layers.quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_layers.quantity IS 'Original quantity received in this layer';


--
-- Name: COLUMN cost_layers.remaining_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_layers.remaining_quantity IS 'Quantity remaining after sales (FIFO deduction)';


--
-- Name: COLUMN cost_layers.unit_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_layers.unit_cost IS 'Cost per unit for this layer';


--
-- Name: COLUMN cost_layers.received_date; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_layers.received_date IS 'Date when inventory was received (determines FIFO order)';


--
-- Name: COLUMN cost_layers.is_active; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.cost_layers.is_active IS 'False when layer is fully depleted (remaining_quantity = 0)';


--
-- Name: credit_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_applications (
    "Id" uuid NOT NULL,
    "CreditId" uuid NOT NULL,
    "CustomerCreditId" uuid NOT NULL,
    "InvoiceId" uuid NOT NULL,
    "InvoiceNumber" character varying(100),
    "AmountApplied" numeric(18,6) NOT NULL,
    "ApplicationDate" timestamp with time zone NOT NULL,
    "Status" character varying(20) NOT NULL,
    "Notes" character varying(500),
    "LedgerTransactionId" uuid,
    "AppliedById" uuid,
    "ReversedByTransactionId" uuid,
    "ReversedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);


--
-- Name: customer_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_accounts (
    "Id" uuid NOT NULL,
    "CustomerId" uuid NOT NULL,
    "CustomerName" character varying(200) NOT NULL,
    "CreditBalance" numeric(18,6) NOT NULL,
    "OutstandingReceivables" numeric(18,6) NOT NULL,
    "TotalDepositsReceived" numeric(18,6) NOT NULL,
    "TotalDepositsApplied" numeric(18,6) NOT NULL,
    "AvailableDepositBalance" numeric(18,6) NOT NULL,
    "CreditLimit" numeric(18,6) NOT NULL,
    "IsActive" boolean NOT NULL,
    "LastTransactionDate" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "TotalDepositBalance" numeric(18,6) NOT NULL,
    "TotalCreditBalance" numeric(18,6) NOT NULL
);


--
-- Name: customer_balance_adjustments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_balance_adjustments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference character varying(100),
    description text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE customer_balance_adjustments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_balance_adjustments IS 'Manual adjustments to customer balances (UUID variant)';


--
-- Name: COLUMN customer_balance_adjustments.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_balance_adjustments.amount IS 'Positive values increase balance (debit), negative values decrease balance (credit)';


--
-- Name: customer_balance_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_balance_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    customer_id uuid NOT NULL,
    customer_name character varying(255),
    old_balance numeric(15,2),
    new_balance numeric(15,2),
    change_amount numeric(15,2),
    change_source character varying(100),
    reference_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE customer_balance_audit; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_balance_audit IS 'Audit trail of all customer balance changes for debugging';


--
-- Name: customer_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_credits (
    "Id" uuid NOT NULL,
    "CustomerAccountId" uuid NOT NULL,
    "CreditAmount" numeric(18,6) NOT NULL,
    "Amount" numeric(18,6) NOT NULL,
    "AmountUsed" numeric(18,6) NOT NULL,
    "RemainingBalance" numeric(18,6) NOT NULL,
    "RemainingAmount" numeric(18,6) NOT NULL,
    "CreditType" character varying(50) NOT NULL,
    "SourceReferenceId" uuid,
    "SourceReferenceType" character varying(50),
    "CreditReference" character varying(100),
    "CreditDate" timestamp with time zone NOT NULL,
    "Status" character varying(20) NOT NULL,
    "ExpiryDate" timestamp with time zone,
    "Reason" character varying(500),
    "LedgerTransactionId" uuid,
    "CreatedById" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "CustomerAccountId1" uuid
);


--
-- Name: customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    email character varying(255),
    phone character varying(50),
    address text,
    customer_group_id uuid,
    balance numeric(15,2) DEFAULT 0.00,
    credit_limit numeric(15,2) DEFAULT 0.00,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    customer_number character varying(20)
);


--
-- Name: COLUMN customers.customer_group_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.customer_group_id IS 'Associates customer with a pricing group for special rates';


--
-- Name: COLUMN customers.customer_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customers.customer_number IS 'Human-readable customer ID (CUST-0001)';


--
-- Name: pos_customer_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_customer_deposits (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deposit_number character varying(50) NOT NULL,
    customer_id uuid NOT NULL,
    amount numeric(18,2) NOT NULL,
    amount_used numeric(18,2) DEFAULT 0 NOT NULL,
    amount_available numeric(18,2) NOT NULL,
    payment_method character varying(20) NOT NULL,
    reference character varying(100),
    notes text,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_deposit_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT chk_deposit_available_valid CHECK ((amount_available >= (0)::numeric)),
    CONSTRAINT chk_deposit_status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'DEPLETED'::character varying, 'REFUNDED'::character varying, 'CANCELLED'::character varying])::text[]))),
    CONSTRAINT chk_deposit_used_valid CHECK (((amount_used >= (0)::numeric) AND (amount_used <= amount)))
);


--
-- Name: TABLE pos_customer_deposits; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pos_customer_deposits IS 'Customer advance payments/deposits - managed by Node.js POS API';


--
-- Name: customer_deposit_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.customer_deposit_summary AS
 SELECT c.id AS customer_id,
    c.name AS customer_name,
    COALESCE(sum(
        CASE
            WHEN ((d.status)::text = 'ACTIVE'::text) THEN d.amount_available
            ELSE (0)::numeric
        END), (0)::numeric) AS available_deposit_balance,
    COALESCE(sum(d.amount), (0)::numeric) AS total_deposits,
    COALESCE(sum(d.amount_used), (0)::numeric) AS total_deposits_used,
    count(
        CASE
            WHEN ((d.status)::text = 'ACTIVE'::text) THEN 1
            ELSE NULL::integer
        END) AS active_deposit_count
   FROM (public.customers c
     LEFT JOIN public.pos_customer_deposits d ON ((c.id = d.customer_id)))
  GROUP BY c.id, c.name;


--
-- Name: VIEW customer_deposit_summary; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.customer_deposit_summary IS 'Summary of customer deposit balances';


--
-- Name: customer_deposits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_deposits (
    "Id" uuid NOT NULL,
    "CustomerAccountId" uuid NOT NULL,
    "DepositAmount" numeric(18,6) NOT NULL,
    "Amount" numeric(18,6) NOT NULL,
    "AmountApplied" numeric(18,6) NOT NULL,
    "RemainingBalance" numeric(18,6) NOT NULL,
    "RemainingAmount" numeric(18,6) NOT NULL,
    "DepositReference" character varying(100),
    "Reference" character varying(100),
    "PaymentMethod" character varying(50) NOT NULL,
    "PaymentReference" character varying(200),
    "DepositDate" timestamp with time zone NOT NULL,
    "Status" character varying(20) NOT NULL,
    "Notes" character varying(500),
    "LedgerTransactionId" uuid,
    "CreatedById" uuid,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "CustomerAccountId1" uuid
);


--
-- Name: customer_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_groups (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    discount_percentage numeric(5,4) DEFAULT 0.0000,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE customer_groups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.customer_groups IS 'Groups customers for pricing tiers and bulk discounts (e.g., Wholesale, Retail, VIP)';


--
-- Name: COLUMN customer_groups.discount_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.customer_groups.discount_percentage IS 'Percentage discount for all group members (0.10 = 10% discount)';


--
-- Name: customer_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.customer_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: customer_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_payments (
    "Id" uuid NOT NULL,
    "PaymentNumber" character varying(50) NOT NULL,
    "CustomerId" uuid NOT NULL,
    "CustomerName" character varying(200) NOT NULL,
    "PaymentDate" timestamp with time zone NOT NULL,
    "Amount" numeric(18,6) NOT NULL,
    "PaymentMethod" character varying(20) NOT NULL,
    "Reference" character varying(100),
    "AllocatedAmount" numeric(18,6) NOT NULL,
    "UnallocatedAmount" numeric(18,6) NOT NULL,
    "Status" character varying(20) NOT NULL,
    "Notes" character varying(500),
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);


--
-- Name: data_integrity_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_integrity_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    check_date timestamp with time zone DEFAULT now(),
    check_type character varying(100) NOT NULL,
    entity_type character varying(100),
    entity_id uuid,
    expected_value numeric(18,6),
    actual_value numeric(18,6),
    discrepancy numeric(18,6),
    status character varying(20) DEFAULT 'DETECTED'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: delivery_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_order_id uuid NOT NULL,
    product_id uuid,
    product_name character varying(255) NOT NULL,
    product_code character varying(100),
    quantity_requested numeric(12,3) NOT NULL,
    quantity_delivered numeric(12,3) DEFAULT 0,
    unit_of_measure character varying(50),
    batch_id uuid,
    batch_number character varying(100),
    expiry_date date,
    condition_on_delivery character varying(50) DEFAULT 'GOOD'::character varying,
    damage_notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: delivery_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_number character varying(50) NOT NULL,
    sale_id uuid,
    invoice_id uuid,
    customer_id uuid,
    delivery_date date NOT NULL,
    expected_delivery_time time without time zone,
    actual_delivery_time time without time zone,
    delivery_address text NOT NULL,
    delivery_contact_name character varying(255),
    delivery_contact_phone character varying(50),
    special_instructions text,
    status character varying(50) DEFAULT 'PENDING'::character varying NOT NULL,
    assigned_driver_id uuid,
    assigned_at timestamp with time zone,
    tracking_number character varying(100),
    estimated_distance_km numeric(8,2),
    actual_distance_km numeric(8,2),
    delivery_fee numeric(10,2) DEFAULT 0.00,
    fuel_cost numeric(10,2),
    total_cost numeric(10,2),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    completed_at timestamp with time zone,
    created_by_id uuid,
    updated_by_id uuid,
    CONSTRAINT chk_delivery_number_format CHECK (((delivery_number)::text ~ '^DEL-[0-9]{4}-[0-9]{4}$'::text)),
    CONSTRAINT chk_delivery_status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'ASSIGNED'::character varying, 'IN_TRANSIT'::character varying, 'DELIVERED'::character varying, 'FAILED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: delivery_proof; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_proof (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_order_id uuid NOT NULL,
    proof_type character varying(50) NOT NULL,
    proof_data text,
    recipient_name character varying(255),
    recipient_relationship character varying(100),
    verified_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    verified_by_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_proof_type CHECK (((proof_type)::text = ANY ((ARRAY['SIGNATURE'::character varying, 'PHOTO'::character varying, 'ID_VERIFICATION'::character varying, 'SMS_CONFIRMATION'::character varying])::text[])))
);


--
-- Name: delivery_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_name character varying(255) NOT NULL,
    driver_id uuid,
    vehicle_id character varying(100),
    vehicle_plate_number character varying(50),
    route_date date NOT NULL,
    planned_start_time time without time zone,
    actual_start_time time without time zone,
    planned_end_time time without time zone,
    actual_end_time time without time zone,
    total_distance_km numeric(8,2),
    total_fuel_cost numeric(10,2),
    route_efficiency_score numeric(5,2),
    status character varying(50) DEFAULT 'PLANNED'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    created_by_id uuid,
    CONSTRAINT chk_route_status CHECK (((status)::text = ANY ((ARRAY['PLANNED'::character varying, 'IN_PROGRESS'::character varying, 'COMPLETED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: delivery_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.delivery_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    delivery_order_id uuid NOT NULL,
    old_status character varying(50),
    new_status character varying(50) NOT NULL,
    status_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    latitude numeric(10,8),
    longitude numeric(11,8),
    location_name character varying(255),
    notes text,
    photo_url character varying(500),
    changed_by_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: deposit_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deposit_applications (
    "Id" uuid NOT NULL,
    "DepositId" uuid NOT NULL,
    "CustomerDepositId" uuid NOT NULL,
    "InvoiceId" uuid NOT NULL,
    "InvoiceNumber" character varying(100),
    "AmountApplied" numeric(18,6) NOT NULL,
    "ApplicationDate" timestamp with time zone NOT NULL,
    "Status" character varying(20) NOT NULL,
    "Notes" character varying(500),
    "LedgerTransactionId" uuid,
    "AppliedById" uuid,
    "ReversedByTransactionId" uuid,
    "ReversedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);


--
-- Name: deposit_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deposit_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: discount_authorizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_authorizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    discount_id uuid,
    discount_amount numeric(10,2) NOT NULL,
    discount_type character varying(20) NOT NULL,
    discount_percentage numeric(5,2),
    original_amount numeric(10,2) NOT NULL,
    final_amount numeric(10,2) NOT NULL,
    reason text NOT NULL,
    requested_by uuid NOT NULL,
    requested_by_name character varying(255) NOT NULL,
    approved_by uuid,
    approved_by_name character varying(255),
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    approved_at timestamp with time zone,
    CONSTRAINT discount_authorizations_discount_amount_check CHECK ((discount_amount >= (0)::numeric)),
    CONSTRAINT discount_authorizations_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: TABLE discount_authorizations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.discount_authorizations IS 'Audit trail for all discount applications and approvals';


--
-- Name: COLUMN discount_authorizations.discount_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_authorizations.discount_id IS 'Reference to discount rule (NULL if ad-hoc discount)';


--
-- Name: COLUMN discount_authorizations.discount_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_authorizations.discount_percentage IS 'Calculated percentage for reporting purposes';


--
-- Name: COLUMN discount_authorizations.reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_authorizations.reason IS 'Business reason for discount (required for compliance)';


--
-- Name: COLUMN discount_authorizations.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_authorizations.status IS 'PENDING: awaiting approval, APPROVED: manager approved, REJECTED: denied';


--
-- Name: discount_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discount_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    discount_id uuid NOT NULL,
    min_quantity integer,
    min_amount numeric(10,2),
    customer_group_id uuid,
    product_ids uuid[],
    category character varying(100),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT discount_rules_min_amount_check CHECK ((min_amount >= (0)::numeric)),
    CONSTRAINT discount_rules_min_quantity_check CHECK ((min_quantity > 0))
);


--
-- Name: TABLE discount_rules; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.discount_rules IS 'Advanced conditions for when discount applies';


--
-- Name: COLUMN discount_rules.min_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_rules.min_quantity IS 'Minimum quantity required to trigger discount';


--
-- Name: COLUMN discount_rules.min_amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_rules.min_amount IS 'Minimum purchase amount to trigger discount';


--
-- Name: COLUMN discount_rules.product_ids; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_rules.product_ids IS 'Specific products this discount applies to (NULL = all products)';


--
-- Name: COLUMN discount_rules.category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discount_rules.category IS 'Product category this discount applies to';


--
-- Name: discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    type character varying(20) NOT NULL,
    scope character varying(20) NOT NULL,
    value numeric(10,2) NOT NULL,
    max_discount_amount numeric(10,2),
    min_purchase_amount numeric(10,2),
    requires_approval boolean DEFAULT false,
    approval_roles jsonb,
    is_active boolean DEFAULT true,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT discounts_max_discount_amount_check CHECK ((max_discount_amount >= (0)::numeric)),
    CONSTRAINT discounts_min_purchase_amount_check CHECK ((min_purchase_amount >= (0)::numeric)),
    CONSTRAINT discounts_scope_check CHECK (((scope)::text = ANY ((ARRAY['LINE_ITEM'::character varying, 'CART'::character varying, 'CUSTOMER'::character varying])::text[]))),
    CONSTRAINT discounts_type_check CHECK (((type)::text = ANY ((ARRAY['PERCENTAGE'::character varying, 'FIXED_AMOUNT'::character varying, 'BUY_X_GET_Y'::character varying])::text[]))),
    CONSTRAINT discounts_value_check CHECK ((value >= (0)::numeric))
);


--
-- Name: TABLE discounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.discounts IS 'Discount rules and configurations for POS system';


--
-- Name: COLUMN discounts.type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discounts.type IS 'PERCENTAGE: % off, FIXED_AMOUNT: fixed $ off, BUY_X_GET_Y: promotional';


--
-- Name: COLUMN discounts.scope; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discounts.scope IS 'LINE_ITEM: per item, CART: whole cart, CUSTOMER: customer-specific';


--
-- Name: COLUMN discounts.value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discounts.value IS 'Percentage (0-100) or fixed amount depending on type';


--
-- Name: COLUMN discounts.requires_approval; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discounts.requires_approval IS 'If true, manager PIN required to apply';


--
-- Name: COLUMN discounts.approval_roles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.discounts.approval_roles IS 'Roles allowed to approve this discount (JSON array)';


--
-- Name: expense_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_id uuid NOT NULL,
    approver_id uuid NOT NULL,
    approval_level integer DEFAULT 1 NOT NULL,
    status character varying(20) NOT NULL,
    decision_date timestamp with time zone,
    comments text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expense_approvals_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);


--
-- Name: expense_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    code character varying(20) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    account_id uuid
);


--
-- Name: expense_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expense_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_id uuid NOT NULL,
    filename character varying(255) NOT NULL,
    original_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(100) NOT NULL,
    document_type character varying(50) NOT NULL,
    description text,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT expense_documents_document_type_check CHECK (((document_type)::text = ANY ((ARRAY['RECEIPT'::character varying, 'INVOICE'::character varying, 'CONTRACT'::character varying, 'APPROVAL'::character varying, 'OTHER'::character varying])::text[])))
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    expense_number character varying(50) NOT NULL,
    title character varying(255) NOT NULL,
    amount numeric(12,2) NOT NULL,
    expense_date date NOT NULL,
    category character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    description text,
    category_id uuid,
    supplier_id uuid,
    vendor character varying(255),
    payment_method character varying(20) DEFAULT 'CASH'::character varying,
    receipt_number character varying(100),
    reference_number character varying(100),
    created_by uuid,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_by uuid,
    rejected_at timestamp with time zone,
    rejection_reason text,
    paid_by uuid,
    paid_at timestamp with time zone,
    notes text,
    tags text[],
    updated_at timestamp with time zone DEFAULT now(),
    account_id uuid,
    payment_status character varying(20) DEFAULT 'UNPAID'::character varying,
    payment_account_id uuid,
    CONSTRAINT expenses_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'BANK_TRANSFER'::character varying, 'MOBILE_MONEY'::character varying, 'CHEQUE'::character varying])::text[]))),
    CONSTRAINT expenses_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PAID'::character varying, 'PARTIAL'::character varying])::text[]))),
    CONSTRAINT expenses_status_check CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'PENDING_APPROVAL'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'PAID'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: COLUMN expenses.payment_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.expenses.payment_account_id IS 'The cash/bank account used to pay this expense (CREDIT side of journal entry). Required when payment_status = PAID.';


--
-- Name: failed_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.failed_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    transaction_type character varying(50) NOT NULL,
    attempted_data jsonb NOT NULL,
    error_type character varying(100) NOT NULL,
    error_message text NOT NULL,
    error_stack text,
    user_id uuid,
    user_name character varying(255),
    session_id uuid,
    ip_address inet,
    user_agent text,
    request_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    severity character varying(20) DEFAULT 'ERROR'::character varying,
    notes text,
    resolved_at timestamp with time zone,
    resolved_by_id uuid,
    resolution_notes text,
    CONSTRAINT failed_transactions_severity_check CHECK (((severity)::text = ANY ((ARRAY['WARNING'::character varying, 'ERROR'::character varying, 'CRITICAL'::character varying])::text[]))),
    CONSTRAINT failed_transactions_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['SALE'::character varying, 'PAYMENT'::character varying, 'REFUND'::character varying, 'RETURN'::character varying, 'EXCHANGE'::character varying, 'INVOICE_CREATION'::character varying, 'INVOICE_PAYMENT'::character varying, 'VOID'::character varying, 'INVENTORY_ADJUSTMENT'::character varying, 'PURCHASE_ORDER'::character varying, 'GOODS_RECEIPT'::character varying])::text[])))
);


--
-- Name: TABLE failed_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.failed_transactions IS 'Log failed transaction attempts for debugging and security monitoring';


--
-- Name: COLUMN failed_transactions.attempted_data; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.failed_transactions.attempted_data IS 'JSON snapshot of what the user tried to submit';


--
-- Name: COLUMN failed_transactions.error_stack; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.failed_transactions.error_stack IS 'Full stack trace for technical debugging';


--
-- Name: COLUMN failed_transactions.resolved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.failed_transactions.resolved_at IS 'When the underlying issue was fixed';


--
-- Name: financial_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_periods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    period_name character varying(100) NOT NULL,
    period_type character varying(20) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    is_closed boolean DEFAULT false NOT NULL,
    closed_by uuid,
    closed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "LockedAt" timestamp with time zone,
    "LockedBy" uuid,
    "Status" character varying(20) DEFAULT 'OPEN'::character varying,
    CONSTRAINT chk_closed_fields CHECK ((((is_closed = true) AND (closed_by IS NOT NULL) AND (closed_at IS NOT NULL)) OR (is_closed = false))),
    CONSTRAINT chk_period_dates CHECK ((end_date >= start_date)),
    CONSTRAINT "financial_periods_Status_check" CHECK ((("Status")::text = ANY ((ARRAY['OPEN'::character varying, 'CLOSED'::character varying, 'LOCKED'::character varying])::text[]))),
    CONSTRAINT financial_periods_period_type_check CHECK (((period_type)::text = ANY ((ARRAY['MONTH'::character varying, 'QUARTER'::character varying, 'YEAR'::character varying, 'CUSTOM'::character varying])::text[])))
);


--
-- Name: TABLE financial_periods; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.financial_periods IS 'Manages financial reporting periods for accurate period-based reports';


--
-- Name: goods_receipt_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipt_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    goods_receipt_id uuid NOT NULL,
    product_id uuid NOT NULL,
    received_quantity numeric(15,4) NOT NULL,
    batch_number character varying(100),
    expiry_date date,
    cost_price numeric(15,2) NOT NULL,
    discrepancy_type character varying(50) DEFAULT 'NONE'::character varying,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    uom_id uuid,
    po_item_id uuid
);


--
-- Name: goods_receipts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.goods_receipts (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    receipt_number character varying(50) NOT NULL,
    purchase_order_id uuid,
    received_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    received_by_id uuid,
    status public.goods_receipt_status DEFAULT 'DRAFT'::public.goods_receipt_status,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    delivery_note_number character varying(100),
    delivery_note_date date,
    invoice_number character varying(100),
    invoice_date date,
    invoice_amount numeric(15,2),
    approved_by_id uuid,
    approved_at timestamp with time zone,
    total_value numeric(18,6) DEFAULT 0
);


--
-- Name: COLUMN goods_receipts.receipt_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.goods_receipts.receipt_number IS 'Human-readable GR number (GR-2025-0001)';


--
-- Name: hold_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hold_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inventory_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_batches (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    batch_number character varying(100) NOT NULL,
    product_id uuid NOT NULL,
    quantity numeric(15,4) NOT NULL,
    remaining_quantity numeric(15,4) NOT NULL,
    cost_price numeric(15,2) NOT NULL,
    expiry_date date,
    received_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    status public.batch_status DEFAULT 'ACTIVE'::public.batch_status,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    goods_receipt_id uuid,
    goods_receipt_item_id uuid,
    purchase_order_id uuid,
    purchase_order_item_id uuid,
    source_type character varying(50) DEFAULT 'UNKNOWN'::character varying,
    source_reference_id uuid,
    is_verified boolean DEFAULT false
);


--
-- Name: inventory_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.inventory_snapshots (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    batch_id uuid,
    snapshot_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    quantity_on_hand numeric(15,3) DEFAULT 0 NOT NULL,
    unit_cost numeric(15,2) DEFAULT 0 NOT NULL,
    total_value numeric(15,2) DEFAULT 0 NOT NULL,
    valuation_method character varying(20) DEFAULT 'FIFO'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE inventory_snapshots; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.inventory_snapshots IS 'Point-in-time inventory valuation snapshots for historical reporting';


--
-- Name: invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_line_items (
    "Id" uuid NOT NULL,
    "InvoiceId" uuid NOT NULL,
    "LineNumber" integer NOT NULL,
    "ProductId" character varying(50) NOT NULL,
    "ProductName" character varying(200) NOT NULL,
    "Description" character varying(500),
    "Quantity" numeric(18,6) NOT NULL,
    "UnitOfMeasure" character varying(20),
    "UnitPrice" numeric(18,6) NOT NULL,
    "LineTotal" numeric(18,6) NOT NULL,
    "TaxRate" numeric(5,2) NOT NULL,
    "TaxAmount" numeric(18,6) NOT NULL,
    "LineTotalIncludingTax" numeric(18,6) NOT NULL
);


--
-- Name: invoice_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_payments (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    receipt_number character varying(50) NOT NULL,
    invoice_id uuid NOT NULL,
    payment_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    payment_method public.payment_method NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference_number character varying(200),
    notes text,
    processed_by_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_payment_amount_positive CHECK ((amount > (0)::numeric))
);


--
-- Name: invoice_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name character varying(255) DEFAULT 'SamplePOS'::character varying NOT NULL,
    company_address text,
    company_phone character varying(50),
    company_email character varying(255),
    company_tin character varying(100),
    company_logo_url text,
    template_type character varying(50) DEFAULT 'modern'::character varying NOT NULL,
    primary_color character varying(7) DEFAULT '#2563eb'::character varying,
    secondary_color character varying(7) DEFAULT '#10b981'::character varying,
    show_company_logo boolean DEFAULT false,
    show_tax_breakdown boolean DEFAULT true,
    show_payment_instructions boolean DEFAULT true,
    payment_instructions text,
    terms_and_conditions text,
    footer_text text DEFAULT 'Thank you for your business!'::text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE invoice_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.invoice_settings IS 'Stores invoice configuration and company details';


--
-- Name: COLUMN invoice_settings.template_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_settings.template_type IS 'Invoice template style: modern, classic, minimal, professional';


--
-- Name: COLUMN invoice_settings.primary_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_settings.primary_color IS 'Hex color for primary elements (headers, buttons)';


--
-- Name: COLUMN invoice_settings.secondary_color; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.invoice_settings.secondary_color IS 'Hex color for secondary elements (accents)';


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    "Id" uuid NOT NULL,
    "InvoiceNumber" character varying(50) NOT NULL,
    "CustomerId" uuid NOT NULL,
    "CustomerName" character varying(200) NOT NULL,
    "SaleId" uuid,
    "InvoiceDate" timestamp with time zone NOT NULL,
    "DueDate" timestamp with time zone NOT NULL,
    "Subtotal" numeric(18,6) NOT NULL,
    "TaxAmount" numeric(18,6) NOT NULL,
    "TotalAmount" numeric(18,6) NOT NULL,
    "AmountPaid" numeric(18,6) NOT NULL,
    "OutstandingBalance" numeric(18,6) NOT NULL,
    "Status" character varying(20) DEFAULT 'UNPAID'::public.invoice_status NOT NULL,
    "PaymentTerms" integer NOT NULL,
    "Reference" character varying(100),
    "Notes" character varying(1000),
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    CONSTRAINT chk_amount_paid_not_exceed_total CHECK (("AmountPaid" <= "TotalAmount")),
    CONSTRAINT chk_outstanding_balance_non_negative CHECK (("OutstandingBalance" >= (0)::numeric)),
    CONSTRAINT chk_total_amount_positive CHECK (("TotalAmount" > (0)::numeric))
);


--
-- Name: journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entries (
    "Id" uuid NOT NULL,
    "TransactionId" character varying(50) NOT NULL,
    "Description" character varying(500) NOT NULL,
    "EntryDate" timestamp with time zone NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "Status" character varying(20) DEFAULT 'POSTED'::character varying NOT NULL,
    "IdempotencyKey" character varying(100),
    "SourceEventType" character varying(50),
    "SourceEntityType" character varying(50),
    "SourceEntityId" character varying(100),
    "VoidedAt" timestamp with time zone,
    "VoidReason" text,
    "VoidedByEntryId" uuid
);


--
-- Name: journal_entry_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.journal_entry_lines (
    "Id" uuid NOT NULL,
    "JournalEntryId" uuid NOT NULL,
    "AccountId" uuid NOT NULL,
    "Description" character varying(500) NOT NULL,
    "DebitAmount" numeric(18,6) NOT NULL,
    "CreditAmount" numeric(18,6) NOT NULL,
    "EntityType" character varying(50),
    "EntityId" character varying(100),
    "TransactionId" character varying(50),
    "Metadata" jsonb,
    "CreatedAt" timestamp with time zone NOT NULL
);


--
-- Name: ledger_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_entries (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "TransactionId" uuid NOT NULL,
    "AccountId" uuid NOT NULL,
    "EntryType" character varying(10) NOT NULL,
    "Amount" numeric(18,6) NOT NULL,
    "DebitAmount" numeric(18,6),
    "CreditAmount" numeric(18,6),
    "Description" character varying(500),
    "LineNumber" integer NOT NULL,
    "CreatedAt" timestamp with time zone NOT NULL,
    "LedgerTransactionId" uuid,
    "EntityId" character varying(100),
    "EntityType" character varying(50),
    "EntryDate" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "JournalEntryLineId" uuid,
    "RunningBalance" numeric(18,6) DEFAULT 0.0 NOT NULL
);


--
-- Name: ledger_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ledger_transactions (
    "Id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "TransactionNumber" character varying(50) NOT NULL,
    "TransactionDate" timestamp with time zone NOT NULL,
    "ReferenceType" character varying(50) NOT NULL,
    "ReferenceId" uuid NOT NULL,
    "ReferenceNumber" character varying(100),
    "Description" character varying(500) NOT NULL,
    "TotalDebitAmount" numeric(18,6) NOT NULL,
    "TotalCreditAmount" numeric(18,6) NOT NULL,
    "Status" character varying(20) NOT NULL,
    "CreatedById" uuid,
    "PostedById" uuid,
    "PostedAt" timestamp with time zone,
    "ReversedByTransactionId" uuid,
    "ReversedAt" timestamp with time zone,
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    "OriginalTransactionId" uuid,
    "ReversalTransactionId" uuid,
    "IsReversed" boolean NOT NULL,
    "IdempotencyKey" character varying(255),
    "CreatedBy" uuid,
    "ReversesTransactionId" uuid
);


--
-- Name: manual_journal_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_journal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    entry_number character varying(50) NOT NULL,
    entry_date date NOT NULL,
    reference character varying(50),
    narration character varying(500) NOT NULL,
    total_debit numeric(18,6) DEFAULT 0 NOT NULL,
    total_credit numeric(18,6) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'POSTED'::character varying NOT NULL,
    created_by character varying(100),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone,
    reversal_notes text,
    reversed_by_entry_id uuid,
    CONSTRAINT chk_balanced_entry CHECK ((abs((total_debit - total_credit)) < 0.000001)),
    CONSTRAINT manual_journal_entries_status_check CHECK (((status)::text = ANY ((ARRAY['POSTED'::character varying, 'REVERSED'::character varying])::text[])))
);


--
-- Name: manual_journal_entry_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.manual_journal_entry_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    journal_entry_id uuid NOT NULL,
    line_number integer NOT NULL,
    account_id uuid NOT NULL,
    debit_amount numeric(18,6) DEFAULT 0 NOT NULL,
    credit_amount numeric(18,6) DEFAULT 0 NOT NULL,
    description character varying(500),
    entity_type character varying(50),
    entity_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chk_debit_or_credit CHECK ((((debit_amount > (0)::numeric) AND (credit_amount = (0)::numeric)) OR ((credit_amount > (0)::numeric) AND (debit_amount = (0)::numeric)) OR ((debit_amount = (0)::numeric) AND (credit_amount = (0)::numeric))))
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_number character varying(50) NOT NULL,
    customer_id uuid,
    sale_date date DEFAULT CURRENT_DATE,
    subtotal numeric(15,2) NOT NULL,
    tax_amount numeric(15,2) DEFAULT 0.00,
    discount_amount numeric(15,2) DEFAULT 0.00,
    total_amount numeric(15,2) NOT NULL,
    total_cost numeric(15,2) DEFAULT 0.00,
    profit numeric(15,2) DEFAULT 0.00,
    profit_margin numeric(5,4) DEFAULT 0.0000,
    payment_method public.payment_method NOT NULL,
    amount_paid numeric(15,2) NOT NULL,
    change_amount numeric(15,2) DEFAULT 0.00,
    status public.sale_status DEFAULT 'COMPLETED'::public.sale_status,
    notes text,
    cashier_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    voided_at timestamp with time zone,
    voided_by_id uuid,
    void_reason text,
    void_approved_by_id uuid,
    void_approved_at timestamp with time zone,
    quote_id uuid,
    CONSTRAINT chk_sales_amounts_positive CHECK (((total_amount > (0)::numeric) AND (total_cost >= (0)::numeric))),
    CONSTRAINT chk_sales_credit_has_customer CHECK (((payment_method <> 'CREDIT'::public.payment_method) OR ((payment_method = 'CREDIT'::public.payment_method) AND (customer_id IS NOT NULL)))),
    CONSTRAINT chk_sales_credit_has_debt CHECK (((payment_method <> 'CREDIT'::public.payment_method) OR ((payment_method = 'CREDIT'::public.payment_method) AND (amount_paid < total_amount)))),
    CONSTRAINT chk_sales_outstanding_has_customer CHECK (((amount_paid >= total_amount) OR ((amount_paid < total_amount) AND (customer_id IS NOT NULL)))),
    CONSTRAINT chk_sales_payment_valid CHECK (((amount_paid >= (0)::numeric) AND (amount_paid <= (total_amount * (3)::numeric))))
);


--
-- Name: COLUMN sales.sale_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.sale_number IS 'Human-readable invoice number (INV-2025-0001)';


--
-- Name: COLUMN sales.voided_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.voided_at IS 'Timestamp when sale was voided';


--
-- Name: COLUMN sales.voided_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.voided_by_id IS 'User who initiated the void request';


--
-- Name: COLUMN sales.void_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.void_reason IS 'Required reason for voiding the sale';


--
-- Name: COLUMN sales.void_approved_by_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.void_approved_by_id IS 'Manager who approved the void (if required)';


--
-- Name: COLUMN sales.void_approved_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sales.void_approved_at IS 'Timestamp when void was approved';


--
-- Name: mv_daily_sales_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_daily_sales_summary AS
 SELECT sale_date AS sale_day,
    count(*) AS transaction_count,
    sum(total_amount) AS total_revenue,
    sum(total_cost) AS total_cost,
    sum(profit) AS total_profit,
    avg(total_amount) AS avg_transaction,
    count(DISTINCT customer_id) AS unique_customers
   FROM public.sales
  WHERE (status = 'COMPLETED'::public.sale_status)
  GROUP BY sale_date
  WITH NO DATA;


--
-- Name: mv_expense_summary; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_expense_summary AS
 SELECT ec.id AS category_id,
    ec.name AS category_name,
    date_trunc('month'::text, (e.expense_date)::timestamp with time zone) AS month,
    count(*) AS expense_count,
    sum(e.amount) AS total_amount
   FROM (public.expenses e
     JOIN public.expense_categories ec ON ((e.category_id = ec.id)))
  WHERE ((e.status)::text = 'APPROVED'::text)
  GROUP BY ec.id, ec.name, (date_trunc('month'::text, (e.expense_date)::timestamp with time zone))
  WITH NO DATA;


--
-- Name: payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_allocations (
    "Id" uuid NOT NULL,
    "PaymentId" uuid NOT NULL,
    "InvoiceId" uuid NOT NULL,
    "AmountAllocated" numeric(18,6) NOT NULL,
    "AllocationDate" timestamp with time zone NOT NULL,
    "Notes" character varying(500)
);


--
-- Name: payment_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    payment_method character varying(50) NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT payment_lines_amount_check CHECK ((amount >= (0)::numeric)),
    CONSTRAINT payment_lines_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['CASH'::character varying, 'CARD'::character varying, 'MOBILE_MONEY'::character varying, 'CREDIT'::character varying, 'DEPOSIT'::character varying, 'BANK_TRANSFER'::character varying])::text[])))
);


--
-- Name: TABLE payment_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_lines IS 'Individual payment segments for split payments - allows a single sale to be paid using multiple payment methods';


--
-- Name: COLUMN payment_lines.sale_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_lines.sale_id IS 'Foreign key to sales table';


--
-- Name: COLUMN payment_lines.payment_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_lines.payment_method IS 'Payment method used: CASH, CARD, MOBILE_MONEY, or CREDIT';


--
-- Name: COLUMN payment_lines.amount; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_lines.amount IS 'Amount paid using this payment method';


--
-- Name: COLUMN payment_lines.reference; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_lines.reference IS 'Reference number for card/mobile money transactions';


--
-- Name: COLUMN payment_lines.created_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payment_lines.created_at IS 'Timestamp when payment line was created';


--
-- Name: payment_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_transactions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    transaction_number character varying(50) NOT NULL,
    supplier_payment_id uuid NOT NULL,
    transaction_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    payment_method public.payment_method NOT NULL,
    amount numeric(15,2) NOT NULL,
    reference_number character varying(200),
    receipt_number character varying(100),
    bank_name character varying(200),
    transaction_id character varying(200),
    cheque_number character varying(100),
    notes text,
    processed_by_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE payment_transactions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.payment_transactions IS 'Individual payment transactions for partial or full payments';


--
-- Name: pos_deposit_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_deposit_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deposit_id uuid NOT NULL,
    sale_id uuid NOT NULL,
    amount_applied numeric(18,2) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_by uuid,
    CONSTRAINT chk_application_amount_positive CHECK ((amount_applied > (0)::numeric))
);


--
-- Name: TABLE pos_deposit_applications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pos_deposit_applications IS 'Tracks which deposits were applied to which sales';


--
-- Name: pos_held_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_held_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hold_id uuid NOT NULL,
    product_id uuid NOT NULL,
    product_name character varying(255) NOT NULL,
    product_sku character varying(100),
    product_type character varying(20) DEFAULT 'inventory'::character varying NOT NULL,
    quantity numeric(15,4) NOT NULL,
    unit_price numeric(15,4) NOT NULL,
    cost_price numeric(15,4) DEFAULT 0 NOT NULL,
    subtotal numeric(15,4) NOT NULL,
    is_taxable boolean DEFAULT true NOT NULL,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    tax_amount numeric(15,4) DEFAULT 0 NOT NULL,
    discount_type character varying(20),
    discount_value numeric(15,4),
    discount_amount numeric(15,4) DEFAULT 0 NOT NULL,
    discount_reason text,
    uom_id uuid,
    uom_name character varying(100),
    uom_conversion_factor numeric(15,6),
    metadata jsonb,
    line_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT chk_pos_held_order_items_amounts CHECK (((quantity > (0)::numeric) AND (unit_price >= (0)::numeric) AND (cost_price >= (0)::numeric) AND (subtotal >= (0)::numeric) AND (tax_rate >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (discount_amount >= (0)::numeric)))
);


--
-- Name: TABLE pos_held_order_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pos_held_order_items IS 'Line items for held orders - exact cart state';


--
-- Name: COLUMN pos_held_order_items.product_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_held_order_items.product_type IS 'Product type: inventory, consumable, or service';


--
-- Name: COLUMN pos_held_order_items.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_held_order_items.metadata IS 'Batch preferences, item notes, custom fields';


--
-- Name: pos_held_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pos_held_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    hold_number character varying(50) NOT NULL,
    terminal_id character varying(100),
    user_id uuid NOT NULL,
    customer_id uuid,
    customer_name character varying(255),
    subtotal numeric(15,4) DEFAULT 0 NOT NULL,
    tax_amount numeric(15,4) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,4) DEFAULT 0 NOT NULL,
    total_amount numeric(15,4) DEFAULT 0 NOT NULL,
    hold_reason character varying(255),
    notes text,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    resumed_at timestamp with time zone,
    CONSTRAINT chk_pos_held_orders_amounts CHECK (((subtotal >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (discount_amount >= (0)::numeric) AND (total_amount >= (0)::numeric)))
);


--
-- Name: TABLE pos_held_orders; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pos_held_orders IS 'Temporarily held POS carts - NOT invoices or sales';


--
-- Name: COLUMN pos_held_orders.terminal_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_held_orders.terminal_id IS 'POS terminal/device identifier for multi-till support';


--
-- Name: COLUMN pos_held_orders.metadata; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_held_orders.metadata IS 'Draft payment lines, cart-level discounts, etc.';


--
-- Name: COLUMN pos_held_orders.expires_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_held_orders.expires_at IS 'Optional expiration for auto-cleanup (default: 24 hours)';


--
-- Name: COLUMN pos_held_orders.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pos_held_orders.status IS 'ACTIVE = available for resume, RESUMED = converted to cart/sale, EXPIRED = automatically cleaned up, CANCELLED = manually cancelled';


--
-- Name: pricing_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_tiers (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    customer_group_id uuid,
    name character varying(255),
    pricing_formula text NOT NULL,
    calculated_price numeric(15,2) NOT NULL,
    min_quantity numeric(15,4) DEFAULT 1.0000,
    max_quantity numeric(15,4),
    priority integer DEFAULT 0,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE pricing_tiers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.pricing_tiers IS 'Flexible pricing rules with formula-based calculation per product, customer group, and quantity range';


--
-- Name: COLUMN pricing_tiers.pricing_formula; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.pricing_formula IS 'JavaScript formula (e.g., "cost * 1.20" for 20% markup)';


--
-- Name: COLUMN pricing_tiers.calculated_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.calculated_price IS 'Cached result of formula evaluation (updated when cost changes)';


--
-- Name: COLUMN pricing_tiers.min_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.min_quantity IS 'Minimum order quantity for this tier to apply';


--
-- Name: COLUMN pricing_tiers.max_quantity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.max_quantity IS 'Maximum order quantity (NULL = no upper limit)';


--
-- Name: COLUMN pricing_tiers.priority; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.priority IS 'Higher priority tiers win when multiple match (higher number = higher priority)';


--
-- Name: COLUMN pricing_tiers.valid_from; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.valid_from IS 'Optional start date for seasonal/promotional pricing';


--
-- Name: COLUMN pricing_tiers.valid_until; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pricing_tiers.valid_until IS 'Optional end date for seasonal/promotional pricing';


--
-- Name: processed_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.processed_events (
    "Id" uuid NOT NULL,
    "IdempotencyKey" character varying(100) NOT NULL,
    "EventType" character varying(50) NOT NULL,
    "EntityType" character varying(50) NOT NULL,
    "EntityId" character varying(100) NOT NULL,
    "JournalEntryId" character varying(50),
    "TransactionId" character varying(50),
    "ProcessingStatus" character varying(20) DEFAULT 'SUCCESS'::character varying NOT NULL,
    "ProcessedAt" timestamp with time zone NOT NULL,
    "OriginalEventTimestamp" timestamp with time zone,
    "ProcessingResult" jsonb,
    "ErrorMessage" character varying(1000)
);


--
-- Name: product_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.product_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: product_uoms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.product_uoms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    product_id uuid NOT NULL,
    uom_id uuid NOT NULL,
    conversion_factor numeric(18,6) NOT NULL,
    barcode character varying(100),
    is_default boolean DEFAULT false,
    price_override numeric(18,6),
    cost_override numeric(18,6),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT product_uoms_conversion_factor_check CHECK ((conversion_factor > (0)::numeric))
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sku character varying(100) NOT NULL,
    barcode character varying(100),
    name character varying(255) NOT NULL,
    description text,
    category character varying(100),
    conversion_factor numeric(15,4) DEFAULT 1.0000,
    cost_price numeric(15,2) DEFAULT 0.00,
    selling_price numeric(15,2) DEFAULT 0.00,
    costing_method public.costing_method DEFAULT 'FIFO'::public.costing_method,
    average_cost numeric(15,2) DEFAULT 0.00,
    last_cost numeric(15,2) DEFAULT 0.00,
    pricing_formula text,
    auto_update_price boolean DEFAULT false,
    quantity_on_hand numeric(15,4) DEFAULT 0.0000,
    reorder_level numeric(15,4) DEFAULT 0.0000,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    track_expiry boolean DEFAULT false NOT NULL,
    base_uom_id uuid,
    min_price numeric(15,2) DEFAULT NULL::numeric,
    max_discount_percentage numeric(5,2) DEFAULT NULL::numeric,
    tax_rate numeric(5,2) DEFAULT 0 NOT NULL,
    product_number character varying(20),
    has_tax boolean DEFAULT false NOT NULL,
    tax_mode character varying(20) DEFAULT 'INCLUSIVE'::character varying NOT NULL,
    is_taxable boolean DEFAULT false NOT NULL,
    product_type character varying(20) DEFAULT 'inventory'::character varying NOT NULL,
    is_service boolean GENERATED ALWAYS AS (((product_type)::text = 'service'::text)) STORED,
    allow_price_override boolean DEFAULT false,
    income_account_id uuid,
    CONSTRAINT chk_product_type CHECK (((product_type)::text = ANY ((ARRAY['inventory'::character varying, 'consumable'::character varying, 'service'::character varying])::text[]))),
    CONSTRAINT products_product_type_check CHECK (((product_type)::text = ANY ((ARRAY['inventory'::character varying, 'consumable'::character varying, 'service'::character varying])::text[]))),
    CONSTRAINT products_tax_mode_check CHECK (((tax_mode)::text = ANY ((ARRAY['INCLUSIVE'::character varying, 'EXEMPT'::character varying])::text[])))
);


--
-- Name: COLUMN products.costing_method; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.costing_method IS 'Inventory valuation method: FIFO (oldest first), AVCO (weighted average), or STANDARD (fixed cost)';


--
-- Name: COLUMN products.average_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.average_cost IS 'Weighted average cost calculated from cost layers';


--
-- Name: COLUMN products.last_cost; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.last_cost IS 'Most recent purchase cost (from latest goods receipt)';


--
-- Name: COLUMN products.pricing_formula; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.pricing_formula IS 'JavaScript formula for auto-calculating selling price (e.g., "cost * 1.25" for 25% markup)';


--
-- Name: COLUMN products.auto_update_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.auto_update_price IS 'If true, selling_price automatically recalculates when cost changes';


--
-- Name: COLUMN products.track_expiry; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.track_expiry IS 'Whether this product requires expiry date tracking (perishable goods)';


--
-- Name: COLUMN products.min_price; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.min_price IS 'Minimum allowed selling price for this product (optional)';


--
-- Name: COLUMN products.max_discount_percentage; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.max_discount_percentage IS 'Maximum discount percentage allowed (optional, e.g., 20.00 for 20%)';


--
-- Name: COLUMN products.tax_rate; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.tax_rate IS 'Tax rate percentage (0-100) for this product';


--
-- Name: COLUMN products.has_tax; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.has_tax IS 'When true, product is tax-exclusive (tax added on top of price). When false, refer to tax_mode.';


--
-- Name: COLUMN products.tax_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.tax_mode IS 'Only used when has_tax = false. INCLUSIVE = price includes tax (reverse calculate), EXEMPT = no tax applied.';


--
-- Name: COLUMN products.is_taxable; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_taxable IS 'When true, tax_rate must be applied to this product. When false, product price is either tax-inclusive or tax-exempt.';


--
-- Name: COLUMN products.product_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.product_type IS 'Product classification: inventory (tracked stock), consumable (expiring items), service (labor/services)';


--
-- Name: COLUMN products.is_service; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.is_service IS 'Computed: true when product_type = service';


--
-- Name: COLUMN products.allow_price_override; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.allow_price_override IS 'TRUE = Price can be changed at POS checkout (useful for negotiated services)';


--
-- Name: COLUMN products.income_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.products.income_account_id IS 'Revenue GL account for this product. Service products use 4100 (Service Revenue), inventory typically uses 4000 (Sales Revenue)';


--
-- Name: purchase_order_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_order_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    purchase_order_id uuid NOT NULL,
    product_id uuid NOT NULL,
    ordered_quantity numeric(15,4) NOT NULL,
    received_quantity numeric(15,4) DEFAULT 0.0000,
    unit_price numeric(15,2) NOT NULL,
    total_price numeric(15,2) NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    uom_id uuid
);


--
-- Name: purchase_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.purchase_orders (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    order_number character varying(50) NOT NULL,
    supplier_id uuid NOT NULL,
    order_date timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    expected_delivery_date timestamp with time zone,
    status public.purchase_order_status DEFAULT 'DRAFT'::public.purchase_order_status,
    payment_terms character varying(50),
    total_amount numeric(15,2) DEFAULT 0.00,
    notes text,
    created_by_id uuid,
    sent_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    sent_to_supplier_at timestamp with time zone,
    sent_by_id uuid,
    invoice_number character varying(100),
    invoice_date date,
    invoice_amount numeric(15,2),
    payment_status public.payment_status DEFAULT 'PENDING'::public.payment_status,
    paid_amount numeric(15,2) DEFAULT 0.00,
    outstanding_amount numeric(15,2) DEFAULT 0.00,
    payment_due_date date,
    manual_receipt boolean DEFAULT false
);


--
-- Name: COLUMN purchase_orders.manual_receipt; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.purchase_orders.manual_receipt IS 'Indicates if this PO was auto-generated from a manual goods receipt. True = auto-generated, False = regular PO created by user.';


--
-- Name: quotation_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size bigint,
    mime_type character varying(100),
    description text,
    uploaded_by_id uuid,
    uploaded_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE quotation_attachments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quotation_attachments IS 'Files attached to quotes (site photos, specs, etc)';


--
-- Name: quotation_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    recipient_email character varying(255) NOT NULL,
    recipient_name character varying(255),
    subject character varying(500),
    body text,
    status character varying(20) DEFAULT 'sent'::character varying,
    error_message text,
    opened_at timestamp with time zone,
    sent_by_id uuid,
    sent_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE quotation_emails; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quotation_emails IS 'Log of quote emails sent to customers';


--
-- Name: quotation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    line_number integer NOT NULL,
    product_id uuid,
    item_type character varying(20) DEFAULT 'product'::character varying NOT NULL,
    sku character varying(100),
    description character varying(500) NOT NULL,
    notes text,
    quantity numeric(12,4) NOT NULL,
    unit_price numeric(12,2) NOT NULL,
    discount_amount numeric(12,2) DEFAULT 0,
    subtotal numeric(12,2) NOT NULL,
    is_taxable boolean DEFAULT true,
    tax_rate numeric(5,2) DEFAULT 0,
    tax_amount numeric(12,2) DEFAULT 0,
    line_total numeric(12,2) NOT NULL,
    uom_id uuid,
    uom_name character varying(50),
    unit_cost numeric(12,2),
    cost_total numeric(12,2),
    product_type character varying(20) DEFAULT 'inventory'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT valid_quote_item_amounts CHECK (((quantity > (0)::numeric) AND (unit_price >= (0)::numeric) AND (discount_amount >= (0)::numeric) AND (subtotal >= (0)::numeric) AND (line_total >= (0)::numeric)))
);


--
-- Name: TABLE quotation_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quotation_items IS 'Line items for quotations, supports products, services, and custom items';


--
-- Name: COLUMN quotation_items.item_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotation_items.item_type IS 'product = from inventory, service = non-inventory, custom = one-off item';


--
-- Name: quotation_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotation_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: quotation_status_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotation_status_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quotation_id uuid NOT NULL,
    from_status public.quotation_status,
    to_status public.quotation_status NOT NULL,
    notes text,
    changed_by_id uuid,
    changed_at timestamp with time zone DEFAULT now(),
    ip_address character varying(50),
    user_agent text
);


--
-- Name: TABLE quotation_status_history; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quotation_status_history IS 'Audit trail of quote status changes';


--
-- Name: quotations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quotations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    quote_number character varying(50) NOT NULL,
    quote_type public.quote_type DEFAULT 'standard'::public.quote_type,
    customer_id uuid,
    customer_name character varying(255),
    customer_phone character varying(50),
    customer_email character varying(255),
    reference character varying(255),
    description text,
    subtotal numeric(15,2) DEFAULT 0 NOT NULL,
    discount_amount numeric(15,2) DEFAULT 0,
    tax_amount numeric(15,2) DEFAULT 0 NOT NULL,
    total_amount numeric(15,2) NOT NULL,
    status public.quotation_status DEFAULT 'DRAFT'::public.quotation_status,
    valid_from date DEFAULT CURRENT_DATE NOT NULL,
    valid_until date NOT NULL,
    converted_to_sale_id uuid,
    converted_to_invoice_id uuid,
    converted_at timestamp with time zone,
    created_by_id uuid,
    assigned_to_id uuid,
    terms_and_conditions text,
    payment_terms text,
    delivery_terms text,
    internal_notes text,
    rejection_reason text,
    requires_approval boolean DEFAULT false,
    approved_by_id uuid,
    approved_at timestamp with time zone,
    parent_quote_id uuid,
    revision_number integer DEFAULT 1,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT conversion_complete CHECK ((((status = 'CONVERTED'::public.quotation_status) AND (converted_to_sale_id IS NOT NULL) AND (converted_at IS NOT NULL)) OR (status <> 'CONVERTED'::public.quotation_status))),
    CONSTRAINT valid_amounts CHECK (((subtotal >= (0)::numeric) AND (discount_amount >= (0)::numeric) AND (tax_amount >= (0)::numeric) AND (total_amount >= (0)::numeric))),
    CONSTRAINT valid_dates CHECK ((valid_until >= valid_from))
);


--
-- Name: TABLE quotations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.quotations IS 'Stores both POS quick quotes (cart saves) and standard customer quotations';


--
-- Name: COLUMN quotations.quote_number; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.quote_number IS 'Auto-generated unique quote number (Q-YYYY-####)';


--
-- Name: COLUMN quotations.quote_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.quote_type IS 'quick = POS cart save, standard = formal customer quotation';


--
-- Name: COLUMN quotations.customer_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.customer_id IS 'Links to registered customer, NULL for walk-in customers';


--
-- Name: COLUMN quotations.customer_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.customer_name IS 'Required for walk-in customers when customer_id IS NULL';


--
-- Name: COLUMN quotations.converted_to_sale_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.converted_to_sale_id IS 'Links to sale created from this quote (hybrid integration)';


--
-- Name: COLUMN quotations.converted_to_invoice_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.converted_to_invoice_id IS 'Links to invoice created from this quote (hybrid integration)';


--
-- Name: COLUMN quotations.parent_quote_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.quotations.parent_quote_id IS 'Links to original quote if this is a revision';


--
-- Name: quotations_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.quotations_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rbac_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_user_id uuid NOT NULL,
    target_user_id uuid,
    target_role_id uuid,
    action character varying(50) NOT NULL,
    previous_state jsonb,
    new_state jsonb,
    ip_address character varying(45),
    user_agent text,
    "timestamp" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rbac_audit_logs_action_check CHECK (((action)::text = ANY ((ARRAY['role_created'::character varying, 'role_updated'::character varying, 'role_deleted'::character varying, 'role_permissions_updated'::character varying, 'user_role_assigned'::character varying, 'user_role_removed'::character varying, 'user_role_expired'::character varying, 'permission_denied'::character varying, 'permission_granted'::character varying])::text[])))
);


--
-- Name: rbac_permissions_catalog; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_permissions_catalog (
    key character varying(100) NOT NULL,
    module character varying(50) NOT NULL,
    action character varying(20) NOT NULL,
    description character varying(500) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_role_permissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_role_permissions (
    role_id uuid NOT NULL,
    permission_key character varying(100) NOT NULL,
    granted_at timestamp with time zone DEFAULT now() NOT NULL,
    granted_by uuid NOT NULL
);


--
-- Name: rbac_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    description character varying(500) NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    is_system_role boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by uuid NOT NULL,
    updated_by uuid NOT NULL
);


--
-- Name: rbac_user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role_id uuid NOT NULL,
    scope_type character varying(20),
    scope_id uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL,
    assigned_by uuid NOT NULL,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT rbac_user_roles_scope_type_check CHECK (((scope_type)::text = ANY ((ARRAY['global'::character varying, 'organization'::character varying, 'branch'::character varying, 'warehouse'::character varying])::text[])))
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash character varying(64) NOT NULL,
    family_id uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    is_revoked boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    rotated_at timestamp with time zone,
    device_info text,
    ip_address character varying(45)
);


--
-- Name: report_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.report_runs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    report_type public.report_type NOT NULL,
    report_name character varying(255) NOT NULL,
    parameters jsonb,
    generated_by_id uuid,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    record_count integer DEFAULT 0,
    file_path text,
    file_format character varying(10),
    execution_time_ms integer,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: TABLE report_runs; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.report_runs IS 'Audit trail of all generated reports with metadata';


--
-- Name: COLUMN report_runs.parameters; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_runs.parameters IS 'JSON object containing report filter parameters';


--
-- Name: COLUMN report_runs.execution_time_ms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.report_runs.execution_time_ms IS 'Report generation time in milliseconds for performance tracking';


--
-- Name: reset_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reset_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: route_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    route_id uuid NOT NULL,
    delivery_order_id uuid NOT NULL,
    delivery_sequence integer NOT NULL,
    estimated_arrival_time time without time zone,
    actual_arrival_time time without time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: sale_discounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_discounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    sale_id uuid NOT NULL,
    sale_item_id uuid,
    discount_id uuid,
    discount_type character varying(20) NOT NULL,
    discount_value numeric(10,2) NOT NULL,
    discount_amount numeric(10,2) NOT NULL,
    original_amount numeric(10,2) NOT NULL,
    final_amount numeric(10,2) NOT NULL,
    authorization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT sale_discounts_discount_amount_check CHECK ((discount_amount >= (0)::numeric))
);


--
-- Name: TABLE sale_discounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.sale_discounts IS 'Actual discounts applied to sales and line items';


--
-- Name: COLUMN sale_discounts.sale_item_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_discounts.sale_item_id IS 'NULL for cart-level discounts, UUID for line-item discounts';


--
-- Name: COLUMN sale_discounts.discount_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_discounts.discount_value IS 'Percentage (0-100) or fixed amount used';


--
-- Name: COLUMN sale_discounts.authorization_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_discounts.authorization_id IS 'Reference to approval record if manager approval was required';


--
-- Name: sale_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sale_items (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    sale_id uuid NOT NULL,
    product_id uuid,
    batch_id uuid,
    quantity numeric(15,4) NOT NULL,
    unit_price numeric(15,2) NOT NULL,
    unit_cost numeric(15,2) DEFAULT 0.00,
    discount_amount numeric(15,2) DEFAULT 0.00,
    total_price numeric(15,2) NOT NULL,
    profit numeric(15,2) DEFAULT 0.00,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    uom_id uuid,
    product_type character varying(20) DEFAULT 'inventory'::character varying,
    is_service boolean GENERATED ALWAYS AS (((product_type)::text = 'service'::text)) STORED,
    income_account_id uuid,
    product_name character varying(255),
    item_type character varying(20) DEFAULT 'product'::character varying,
    CONSTRAINT chk_sale_items_product_type CHECK (((product_type)::text = ANY ((ARRAY['inventory'::character varying, 'consumable'::character varying, 'service'::character varying])::text[]))),
    CONSTRAINT sale_items_item_type_check CHECK (((item_type)::text = ANY ((ARRAY['product'::character varying, 'service'::character varying, 'custom'::character varying])::text[])))
);


--
-- Name: COLUMN sale_items.product_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_items.product_id IS 'UUID of product (NULL for custom/service items from quotations)';


--
-- Name: COLUMN sale_items.product_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_items.product_type IS 'Type of product sold: inventory (track stock), consumable (track but expensed), service (no stock tracking)';


--
-- Name: COLUMN sale_items.is_service; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_items.is_service IS 'Computed: true when product_type = service. Used to skip COGS/Inventory GL entries';


--
-- Name: COLUMN sale_items.income_account_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_items.income_account_id IS 'GL account to credit for revenue. Service items use 4100, inventory items use 4000';


--
-- Name: COLUMN sale_items.product_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_items.product_name IS 'Product/service name (stored for custom items, joins from products for regular items)';


--
-- Name: COLUMN sale_items.item_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.sale_items.item_type IS 'Type of item: product (inventory), service (no stock), custom (one-off item)';


--
-- Name: stock_count_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_count_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stock_count_id uuid NOT NULL,
    product_id uuid NOT NULL,
    batch_id uuid,
    expected_qty_base numeric(15,4) DEFAULT 0 NOT NULL,
    counted_qty_base numeric(15,4),
    uom_recorded character varying(50),
    notes text,
    created_by_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: TABLE stock_count_lines; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_count_lines IS 'Individual product/batch lines in a stock count';


--
-- Name: COLUMN stock_count_lines.expected_qty_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_count_lines.expected_qty_base IS 'Expected quantity in base units (from system at count creation)';


--
-- Name: COLUMN stock_count_lines.counted_qty_base; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_count_lines.counted_qty_base IS 'Actual counted quantity in base units';


--
-- Name: COLUMN stock_count_lines.uom_recorded; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_count_lines.uom_recorded IS 'UOM symbol used when recording count (for audit/display)';


--
-- Name: stock_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    location_id uuid,
    state public.stock_count_state DEFAULT 'draft'::public.stock_count_state NOT NULL,
    created_by_id uuid NOT NULL,
    validated_by_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    validated_at timestamp with time zone,
    snapshot_timestamp timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    notes text
);


--
-- Name: TABLE stock_counts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.stock_counts IS 'Physical stock counting sessions (stocktakes)';


--
-- Name: COLUMN stock_counts.state; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_counts.state IS 'draft: being set up, counting: in progress, validating: being validated, done: completed, cancelled: aborted';


--
-- Name: COLUMN stock_counts.snapshot_timestamp; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.stock_counts.snapshot_timestamp IS 'Timestamp when count was created, used for concurrency detection';


--
-- Name: stock_movements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movements (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    movement_number character varying(50) NOT NULL,
    product_id uuid NOT NULL,
    batch_id uuid,
    movement_type public.movement_type NOT NULL,
    quantity numeric(15,4) NOT NULL,
    unit_cost numeric(15,2),
    reference_type character varying(50),
    reference_id uuid,
    notes text,
    created_by_id uuid,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    uom_id uuid,
    stock_count_id uuid
);


--
-- Name: supplier_invoice_line_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_invoice_line_items (
    "Id" uuid NOT NULL,
    "SupplierInvoiceId" uuid NOT NULL,
    "LineNumber" integer NOT NULL,
    "ProductId" character varying(50) NOT NULL,
    "ProductName" character varying(200) NOT NULL,
    "Description" character varying(500),
    "Quantity" numeric(18,6) NOT NULL,
    "UnitOfMeasure" character varying(20),
    "UnitCost" numeric(18,6) NOT NULL,
    "LineTotal" numeric(18,6) NOT NULL,
    "TaxRate" numeric(5,2) NOT NULL,
    "TaxAmount" numeric(18,6) NOT NULL,
    "LineTotalIncludingTax" numeric(18,6) NOT NULL
);


--
-- Name: supplier_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_invoices (
    "Id" uuid NOT NULL,
    "SupplierInvoiceNumber" character varying(50) NOT NULL,
    "InternalReferenceNumber" character varying(50),
    "SupplierId" uuid NOT NULL,
    "PurchaseOrderId" uuid,
    "InvoiceDate" timestamp with time zone NOT NULL,
    "DueDate" timestamp with time zone NOT NULL,
    "Subtotal" numeric(18,6) NOT NULL,
    "TaxAmount" numeric(18,6) NOT NULL,
    "TotalAmount" numeric(18,6) NOT NULL,
    "AmountPaid" numeric(18,6) NOT NULL,
    "OutstandingBalance" numeric(18,6) NOT NULL,
    "Status" character varying(20) NOT NULL,
    "CurrencyCode" character varying(3) NOT NULL,
    "Notes" character varying(1000),
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: supplier_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.supplier_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: supplier_payment_allocations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payment_allocations (
    "Id" uuid NOT NULL,
    "PaymentId" uuid NOT NULL,
    "SupplierInvoiceId" uuid NOT NULL,
    "AmountAllocated" numeric(18,6) NOT NULL,
    "AllocationDate" timestamp with time zone NOT NULL,
    "Notes" character varying(500),
    deleted_at timestamp with time zone
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    "Id" uuid NOT NULL,
    "PaymentNumber" character varying(50) NOT NULL,
    "SupplierId" uuid NOT NULL,
    "PaymentDate" timestamp with time zone NOT NULL,
    "Amount" numeric(18,6) NOT NULL,
    "PaymentMethod" character varying(20) NOT NULL,
    "Reference" character varying(100),
    "AllocatedAmount" numeric(18,6) NOT NULL,
    "UnallocatedAmount" numeric(18,6) NOT NULL,
    "Status" character varying(20) NOT NULL,
    "CurrencyCode" character varying(3) NOT NULL,
    "Notes" character varying(500),
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL,
    allocated_amount numeric(15,2) DEFAULT 0,
    deleted_at timestamp with time zone
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    "Id" uuid NOT NULL,
    "SupplierCode" character varying(50) NOT NULL,
    "CompanyName" character varying(200) NOT NULL,
    "ContactName" character varying(100),
    "Email" character varying(100),
    "Phone" character varying(20),
    "Address" character varying(500),
    "DefaultPaymentTerms" integer NOT NULL,
    "CreditLimit" numeric(18,6) NOT NULL,
    "OutstandingBalance" numeric(18,6) NOT NULL,
    "TaxId" character varying(50),
    "IsActive" boolean NOT NULL,
    "Notes" character varying(1000),
    "CreatedAt" timestamp with time zone NOT NULL,
    "UpdatedAt" timestamp with time zone NOT NULL
);


--
-- Name: system_backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_backups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    backup_number character varying(50) NOT NULL,
    file_name character varying(255) NOT NULL,
    file_path character varying(500) NOT NULL,
    file_size bigint DEFAULT 0 NOT NULL,
    checksum character varying(64),
    backup_type character varying(50) DEFAULT 'FULL'::character varying NOT NULL,
    status character varying(50) DEFAULT 'COMPLETED'::character varying NOT NULL,
    reason character varying(500),
    created_by uuid,
    created_by_name character varying(255),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    verified_at timestamp with time zone,
    verified_by uuid,
    is_verified boolean DEFAULT false,
    last_restored_at timestamp with time zone,
    last_restored_by uuid,
    restore_count integer DEFAULT 0,
    stats_snapshot jsonb,
    is_deleted boolean DEFAULT false,
    deleted_at timestamp with time zone,
    deleted_by uuid
);


--
-- Name: TABLE system_backups; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_backups IS 'ERP-grade backup tracking with checksums and verification';


--
-- Name: system_maintenance_mode; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_maintenance_mode (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    reason character varying(500),
    operation_type character varying(50),
    started_at timestamp with time zone,
    started_by uuid,
    expected_duration_minutes integer,
    ended_at timestamp with time zone,
    ended_by uuid
);


--
-- Name: TABLE system_maintenance_mode; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_maintenance_mode IS 'Controls system availability during maintenance operations';


--
-- Name: system_reset_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_reset_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    reset_number character varying(50) NOT NULL,
    reset_type character varying(50) NOT NULL,
    backup_id uuid,
    backup_number character varying(50),
    authorized_by uuid NOT NULL,
    authorized_by_name character varying(255),
    confirmation_phrase character varying(100),
    reason character varying(500) NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    status character varying(50) DEFAULT 'IN_PROGRESS'::character varying NOT NULL,
    tables_cleared jsonb,
    records_deleted integer DEFAULT 0,
    balances_reset jsonb,
    error_message text,
    rollback_reason text,
    ip_address character varying(45),
    user_agent character varying(500),
    session_id character varying(100)
);


--
-- Name: TABLE system_reset_log; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_reset_log IS 'Immutable audit trail for system reset operations';


--
-- Name: system_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    business_name character varying(255) DEFAULT 'SamplePOS'::character varying NOT NULL,
    currency_code character varying(10) DEFAULT 'UGX'::character varying NOT NULL,
    currency_symbol character varying(10) DEFAULT 'UGX'::character varying NOT NULL,
    date_format character varying(20) DEFAULT 'YYYY-MM-DD'::character varying NOT NULL,
    time_format character varying(20) DEFAULT '24h'::character varying NOT NULL,
    timezone character varying(100) DEFAULT 'Africa/Kampala'::character varying NOT NULL,
    tax_enabled boolean DEFAULT false NOT NULL,
    default_tax_rate numeric(5,2) DEFAULT 0.00 NOT NULL,
    tax_name character varying(100) DEFAULT 'VAT'::character varying,
    tax_number character varying(100),
    tax_inclusive boolean DEFAULT true NOT NULL,
    tax_rates jsonb DEFAULT '[]'::jsonb,
    receipt_printer_enabled boolean DEFAULT true NOT NULL,
    receipt_printer_name character varying(255),
    receipt_paper_width integer DEFAULT 80 NOT NULL,
    receipt_auto_print boolean DEFAULT false NOT NULL,
    receipt_show_logo boolean DEFAULT true NOT NULL,
    receipt_logo_url text,
    receipt_header_text text,
    receipt_footer_text text DEFAULT 'Thank you for your business!'::text,
    receipt_show_tax_breakdown boolean DEFAULT true NOT NULL,
    receipt_show_qr_code boolean DEFAULT false NOT NULL,
    invoice_printer_enabled boolean DEFAULT true NOT NULL,
    invoice_printer_name character varying(255),
    invoice_paper_size character varying(10) DEFAULT 'A4'::character varying NOT NULL,
    invoice_template character varying(50) DEFAULT 'standard'::character varying NOT NULL,
    invoice_show_logo boolean DEFAULT true NOT NULL,
    invoice_show_payment_terms boolean DEFAULT true NOT NULL,
    invoice_default_payment_terms text DEFAULT 'Payment due within 30 days'::text,
    low_stock_alerts_enabled boolean DEFAULT true NOT NULL,
    low_stock_threshold integer DEFAULT 10 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by_id uuid
);


--
-- Name: TABLE system_settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.system_settings IS 'Application-wide configuration including tax and printing settings (singleton table)';


--
-- Name: COLUMN system_settings.tax_inclusive; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_settings.tax_inclusive IS 'If true, displayed prices include tax; if false, tax is added at checkout';


--
-- Name: COLUMN system_settings.tax_rates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_settings.tax_rates IS 'JSON array of tax rates: [{"name": "Standard VAT", "rate": 18, "default": true}]';


--
-- Name: COLUMN system_settings.receipt_paper_width; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.system_settings.receipt_paper_width IS 'Thermal printer paper width in millimeters (58mm or 80mm)';


--
-- Name: uoms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uoms (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    symbol character varying(20),
    type character varying(20) DEFAULT 'QUANTITY'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uoms_type_check CHECK (((type)::text = ANY (ARRAY[('QUANTITY'::character varying)::text, ('WEIGHT'::character varying)::text, ('VOLUME'::character varying)::text, ('LENGTH'::character varying)::text, ('AREA'::character varying)::text, ('TIME'::character varying)::text])))
);


--
-- Name: user_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_number_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    user_name character varying(255) NOT NULL,
    user_role character varying(50) NOT NULL,
    login_at timestamp with time zone DEFAULT now() NOT NULL,
    logout_at timestamp with time zone,
    session_duration_seconds integer,
    ip_address inet,
    user_agent text,
    device_type character varying(50),
    terminal_id character varying(50),
    is_active boolean DEFAULT true NOT NULL,
    logout_reason character varying(50),
    last_activity_at timestamp with time zone DEFAULT now() NOT NULL,
    actions_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_sessions_logout_check CHECK (((logout_at IS NULL) OR (logout_at >= login_at)))
);


--
-- Name: TABLE user_sessions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.user_sessions IS 'Track user login sessions for audit and security';


--
-- Name: COLUMN user_sessions.session_duration_seconds; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sessions.session_duration_seconds IS 'Total session duration in seconds (calculated on logout)';


--
-- Name: COLUMN user_sessions.last_activity_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sessions.last_activity_at IS 'Updated on each user action for idle timeout detection';


--
-- Name: COLUMN user_sessions.actions_count; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.user_sessions.actions_count IS 'Number of audited actions performed in this session';


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(255) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(255) NOT NULL,
    role character varying(50) NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    totp_secret character varying(64),
    totp_enabled boolean DEFAULT false,
    totp_verified_at timestamp with time zone,
    backup_codes text[],
    password_changed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    password_history text[] DEFAULT '{}'::text[],
    failed_login_attempts integer DEFAULT 0,
    lockout_until timestamp with time zone,
    user_number character varying(20) NOT NULL,
    CONSTRAINT users_role_check CHECK (((role)::text = ANY (ARRAY[('ADMIN'::character varying)::text, ('MANAGER'::character varying)::text, ('CASHIER'::character varying)::text, ('STAFF'::character varying)::text])))
);


--
-- Name: v_accounting_integrity; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_accounting_integrity AS
 SELECT 'AR (1200)'::text AS account,
    ar.gl_balance,
    ar.subledger_balance,
    ar.difference,
    ar.is_balanced
   FROM public.check_ar_reconciliation() ar(gl_balance, subledger_balance, difference, is_balanced)
UNION ALL
 SELECT 'AP (2100)'::text AS account,
    ap.gl_balance,
    ap.subledger_balance,
    ap.difference,
    ap.is_balanced
   FROM public.check_ap_reconciliation() ap(gl_balance, subledger_balance, difference, is_balanced);


--
-- Name: VIEW v_accounting_integrity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_accounting_integrity IS 'Quick view to check GL vs subledger reconciliation for AR and AP accounts';


--
-- Name: v_bank_account_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_bank_account_balances AS
 SELECT ba.id,
    ba.account_code,
    ba.account_name AS name,
    ba.bank_name,
    ba.account_number,
    ba.gl_account_id,
    a."AccountCode" AS gl_code,
    a."AccountName" AS gl_name,
    COALESCE(( SELECT sum((le."DebitAmount" - le."CreditAmount")) AS sum
           FROM public.ledger_entries le
          WHERE (le."AccountId" = ba.gl_account_id)), (0)::numeric) AS gl_balance,
    ba.current_balance,
    ba.opening_balance,
    ba.low_balance_threshold,
    ba.low_balance_alert_enabled,
    ba.is_default,
    ba.is_active
   FROM (public.bank_accounts ba
     LEFT JOIN public.accounts a ON ((a."Id" = ba.gl_account_id)))
  WHERE (ba.is_active = true);


--
-- Name: VIEW v_bank_account_balances; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_bank_account_balances IS 'Bank accounts with calculated GL balances';


--
-- Name: v_expense_gl_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_expense_gl_summary AS
 SELECT a."AccountCode",
    a."AccountName",
    count(e.id) AS expense_count,
    COALESCE(sum(e.amount), (0)::numeric) AS total_expense_amount,
    COALESCE(( SELECT (sum(le."DebitAmount") - sum(le."CreditAmount"))
           FROM (public.ledger_entries le
             JOIN public.ledger_transactions lt ON ((le."TransactionId" = lt."Id")))
          WHERE ((le."AccountId" = a."Id") AND ((lt."Status")::text = 'POSTED'::text))), (0)::numeric) AS gl_balance,
        CASE
            WHEN (COALESCE(sum(
            CASE
                WHEN ((e.status)::text = 'PAID'::text) THEN e.amount
                ELSE (0)::numeric
            END), (0)::numeric) = COALESCE(( SELECT (sum(le."DebitAmount") - sum(le."CreditAmount"))
               FROM (public.ledger_entries le
                 JOIN public.ledger_transactions lt ON ((le."TransactionId" = lt."Id")))
              WHERE ((le."AccountId" = a."Id") AND ((lt."Status")::text = 'POSTED'::text))), (0)::numeric)) THEN 'MATCHED'::text
            ELSE 'DISCREPANCY'::text
        END AS reconciliation_status
   FROM (public.accounts a
     LEFT JOIN public.expenses e ON ((e.account_id = a."Id")))
  WHERE ((a."AccountType")::text = 'EXPENSE'::text)
  GROUP BY a."Id", a."AccountCode", a."AccountName"
  ORDER BY a."AccountCode";


--
-- Name: v_transaction_integrity_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_transaction_integrity_status AS
 SELECT check_name,
    issue_count,
    status,
    details
   FROM public.fn_check_transaction_integrity() fn_check_transaction_integrity(check_name, issue_count, status, details);


--
-- Name: vw_account_balances; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.vw_account_balances AS
 SELECT a."Id" AS account_id,
    a."AccountCode" AS account_code,
    a."AccountName" AS account_name,
    a."AccountType" AS account_type,
    a."NormalBalance" AS normal_balance,
    a."ParentAccountId" AS parent_account_id,
    a."Level" AS account_level,
    a."IsActive" AS is_active,
    COALESCE(sum(le."DebitAmount"), (0)::numeric) AS total_debits,
    COALESCE(sum(le."CreditAmount"), (0)::numeric) AS total_credits,
    (COALESCE(sum(le."DebitAmount"), (0)::numeric) - COALESCE(sum(le."CreditAmount"), (0)::numeric)) AS net_balance
   FROM (public.accounts a
     LEFT JOIN public.ledger_entries le ON ((le."AccountId" = a."Id")))
  GROUP BY a."Id", a."AccountCode", a."AccountName", a."AccountType", a."NormalBalance", a."ParentAccountId", a."Level", a."IsActive";


--
-- Name: __EFMigrationsHistory PK___EFMigrationsHistory; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."__EFMigrationsHistory"
    ADD CONSTRAINT "PK___EFMigrationsHistory" PRIMARY KEY ("MigrationId");


--
-- Name: accounts PK_accounts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "PK_accounts" PRIMARY KEY ("Id");


--
-- Name: credit_applications PK_credit_applications; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_applications
    ADD CONSTRAINT "PK_credit_applications" PRIMARY KEY ("Id");


--
-- Name: customer_accounts PK_customer_accounts; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_accounts
    ADD CONSTRAINT "PK_customer_accounts" PRIMARY KEY ("Id");


--
-- Name: customer_credits PK_customer_credits; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT "PK_customer_credits" PRIMARY KEY ("Id");


--
-- Name: customer_deposits PK_customer_deposits; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT "PK_customer_deposits" PRIMARY KEY ("Id");


--
-- Name: customer_payments PK_customer_payments; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_payments
    ADD CONSTRAINT "PK_customer_payments" PRIMARY KEY ("Id");


--
-- Name: deposit_applications PK_deposit_applications; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_applications
    ADD CONSTRAINT "PK_deposit_applications" PRIMARY KEY ("Id");


--
-- Name: invoice_line_items PK_invoice_line_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT "PK_invoice_line_items" PRIMARY KEY ("Id");


--
-- Name: invoices PK_invoices; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT "PK_invoices" PRIMARY KEY ("Id");


--
-- Name: journal_entries PK_journal_entries; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "PK_journal_entries" PRIMARY KEY ("Id");


--
-- Name: journal_entry_lines PK_journal_entry_lines; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT "PK_journal_entry_lines" PRIMARY KEY ("Id");


--
-- Name: ledger_entries PK_ledger_entries; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("Id");


--
-- Name: ledger_transactions PK_ledger_transactions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT "PK_ledger_transactions" PRIMARY KEY ("Id");


--
-- Name: payment_allocations PK_payment_allocations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT "PK_payment_allocations" PRIMARY KEY ("Id");


--
-- Name: processed_events PK_processed_events; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.processed_events
    ADD CONSTRAINT "PK_processed_events" PRIMARY KEY ("Id");


--
-- Name: supplier_invoice_line_items PK_supplier_invoice_line_items; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoice_line_items
    ADD CONSTRAINT "PK_supplier_invoice_line_items" PRIMARY KEY ("Id");


--
-- Name: supplier_invoices PK_supplier_invoices; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT "PK_supplier_invoices" PRIMARY KEY ("Id");


--
-- Name: supplier_payment_allocations PK_supplier_payment_allocations; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT "PK_supplier_payment_allocations" PRIMARY KEY ("Id");


--
-- Name: supplier_payments PK_supplier_payments; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT "PK_supplier_payments" PRIMARY KEY ("Id");


--
-- Name: suppliers PK_suppliers; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT "PK_suppliers" PRIMARY KEY ("Id");


--
-- Name: accounting_period_history accounting_period_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period_history
    ADD CONSTRAINT accounting_period_history_pkey PRIMARY KEY (id);


--
-- Name: accounting_periods accounting_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (id);


--
-- Name: approval_limits approval_limits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approval_limits
    ADD CONSTRAINT approval_limits_pkey PRIMARY KEY (id);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: bank_accounts bank_accounts_account_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_account_code_key UNIQUE (account_code);


--
-- Name: bank_accounts bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: bank_alerts bank_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_alerts
    ADD CONSTRAINT bank_alerts_pkey PRIMARY KEY (id);


--
-- Name: bank_categories bank_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_categories
    ADD CONSTRAINT bank_categories_code_key UNIQUE (code);


--
-- Name: bank_categories bank_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_categories
    ADD CONSTRAINT bank_categories_pkey PRIMARY KEY (id);


--
-- Name: bank_patterns bank_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_patterns
    ADD CONSTRAINT bank_patterns_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliation_items bank_reconciliation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliations bank_reconciliations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_pkey PRIMARY KEY (id);


--
-- Name: bank_reconciliations bank_reconciliations_reconciliation_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_reconciliation_number_key UNIQUE (reconciliation_number);


--
-- Name: bank_recurring_rules bank_recurring_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recurring_rules
    ADD CONSTRAINT bank_recurring_rules_pkey PRIMARY KEY (id);


--
-- Name: bank_statement_lines bank_statement_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_pkey PRIMARY KEY (id);


--
-- Name: bank_statements bank_statements_statement_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_statement_number_key UNIQUE (statement_number);


--
-- Name: bank_templates bank_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_templates
    ADD CONSTRAINT bank_templates_pkey PRIMARY KEY (id);


--
-- Name: bank_transaction_patterns bank_transaction_patterns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transaction_patterns
    ADD CONSTRAINT bank_transaction_patterns_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_pkey PRIMARY KEY (id);


--
-- Name: bank_transactions bank_transactions_transaction_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_transaction_number_key UNIQUE (transaction_number);


--
-- Name: cash_bank_transfers cash_bank_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_bank_transfers
    ADD CONSTRAINT cash_bank_transfers_pkey PRIMARY KEY (id);


--
-- Name: cash_bank_transfers cash_bank_transfers_transfer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_bank_transfers
    ADD CONSTRAINT cash_bank_transfers_transfer_number_key UNIQUE (transfer_number);


--
-- Name: cash_book_entries cash_book_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_book_entries
    ADD CONSTRAINT cash_book_entries_entry_number_key UNIQUE (entry_number);


--
-- Name: cash_book_entries cash_book_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_book_entries
    ADD CONSTRAINT cash_book_entries_pkey PRIMARY KEY (id);


--
-- Name: cash_movements cash_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_pkey PRIMARY KEY (id);


--
-- Name: cash_register_sessions cash_register_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_pkey PRIMARY KEY (id);


--
-- Name: cash_registers cash_registers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_registers
    ADD CONSTRAINT cash_registers_pkey PRIMARY KEY (id);


--
-- Name: cost_layers cost_layers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_layers
    ADD CONSTRAINT cost_layers_pkey PRIMARY KEY (id);


--
-- Name: customer_balance_adjustments customer_balance_adjustments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_balance_adjustments
    ADD CONSTRAINT customer_balance_adjustments_pkey PRIMARY KEY (id);


--
-- Name: customer_balance_audit customer_balance_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_balance_audit
    ADD CONSTRAINT customer_balance_audit_pkey PRIMARY KEY (id);


--
-- Name: customer_groups customer_groups_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_groups
    ADD CONSTRAINT customer_groups_name_key UNIQUE (name);


--
-- Name: customer_groups customer_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_groups
    ADD CONSTRAINT customer_groups_pkey PRIMARY KEY (id);


--
-- Name: customers customers_customer_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_number_key UNIQUE (customer_number);


--
-- Name: customers customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_pkey PRIMARY KEY (id);


--
-- Name: data_integrity_log data_integrity_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_integrity_log
    ADD CONSTRAINT data_integrity_log_pkey PRIMARY KEY (id);


--
-- Name: delivery_items delivery_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_pkey PRIMARY KEY (id);


--
-- Name: delivery_orders delivery_orders_delivery_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_delivery_number_key UNIQUE (delivery_number);


--
-- Name: delivery_orders delivery_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_pkey PRIMARY KEY (id);


--
-- Name: delivery_orders delivery_orders_tracking_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_tracking_number_key UNIQUE (tracking_number);


--
-- Name: delivery_proof delivery_proof_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_pkey PRIMARY KEY (id);


--
-- Name: delivery_routes delivery_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_routes
    ADD CONSTRAINT delivery_routes_pkey PRIMARY KEY (id);


--
-- Name: delivery_status_history delivery_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_status_history
    ADD CONSTRAINT delivery_status_history_pkey PRIMARY KEY (id);


--
-- Name: discount_authorizations discount_authorizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_authorizations
    ADD CONSTRAINT discount_authorizations_pkey PRIMARY KEY (id);


--
-- Name: discount_rules discount_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rules
    ADD CONSTRAINT discount_rules_pkey PRIMARY KEY (id);


--
-- Name: discounts discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discounts
    ADD CONSTRAINT discounts_pkey PRIMARY KEY (id);


--
-- Name: expense_approvals expense_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_approvals
    ADD CONSTRAINT expense_approvals_pkey PRIMARY KEY (id);


--
-- Name: expense_categories expense_categories_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_code_key UNIQUE (code);


--
-- Name: expense_categories expense_categories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_name_key UNIQUE (name);


--
-- Name: expense_categories expense_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_pkey PRIMARY KEY (id);


--
-- Name: expense_documents expense_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_documents
    ADD CONSTRAINT expense_documents_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_expense_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_expense_number_key UNIQUE (expense_number);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: failed_transactions failed_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_transactions
    ADD CONSTRAINT failed_transactions_pkey PRIMARY KEY (id);


--
-- Name: financial_periods financial_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_pkey PRIMARY KEY (id);


--
-- Name: goods_receipt_items goods_receipt_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_pkey PRIMARY KEY (id);


--
-- Name: goods_receipts goods_receipts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_pkey PRIMARY KEY (id);


--
-- Name: goods_receipts goods_receipts_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_receipt_number_key UNIQUE (receipt_number);


--
-- Name: inventory_batches inventory_batches_batch_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_batch_number_key UNIQUE (batch_number);


--
-- Name: inventory_batches inventory_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_pkey PRIMARY KEY (id);


--
-- Name: inventory_snapshots inventory_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_snapshots
    ADD CONSTRAINT inventory_snapshots_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);


--
-- Name: invoice_payments invoice_payments_receipt_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_receipt_number_key UNIQUE (receipt_number);


--
-- Name: invoice_settings invoice_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_settings
    ADD CONSTRAINT invoice_settings_pkey PRIMARY KEY (id);


--
-- Name: ledger_transactions ledger_transactions_IdempotencyKey_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT "ledger_transactions_IdempotencyKey_key" UNIQUE ("IdempotencyKey");


--
-- Name: manual_journal_entries manual_journal_entries_entry_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entries
    ADD CONSTRAINT manual_journal_entries_entry_number_key UNIQUE (entry_number);


--
-- Name: manual_journal_entries manual_journal_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entries
    ADD CONSTRAINT manual_journal_entries_pkey PRIMARY KEY (id);


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_journal_entry_id_line_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_journal_entry_id_line_number_key UNIQUE (journal_entry_id, line_number);


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_pkey PRIMARY KEY (id);


--
-- Name: payment_lines payment_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_lines
    ADD CONSTRAINT payment_lines_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_pkey PRIMARY KEY (id);


--
-- Name: payment_transactions payment_transactions_transaction_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_transaction_number_key UNIQUE (transaction_number);


--
-- Name: pos_customer_deposits pos_customer_deposits_deposit_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_customer_deposits
    ADD CONSTRAINT pos_customer_deposits_deposit_number_key UNIQUE (deposit_number);


--
-- Name: pos_customer_deposits pos_customer_deposits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_customer_deposits
    ADD CONSTRAINT pos_customer_deposits_pkey PRIMARY KEY (id);


--
-- Name: pos_deposit_applications pos_deposit_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_deposit_applications
    ADD CONSTRAINT pos_deposit_applications_pkey PRIMARY KEY (id);


--
-- Name: pos_held_order_items pos_held_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_order_items
    ADD CONSTRAINT pos_held_order_items_pkey PRIMARY KEY (id);


--
-- Name: pos_held_orders pos_held_orders_hold_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_orders
    ADD CONSTRAINT pos_held_orders_hold_number_key UNIQUE (hold_number);


--
-- Name: pos_held_orders pos_held_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_orders
    ADD CONSTRAINT pos_held_orders_pkey PRIMARY KEY (id);


--
-- Name: pricing_tiers pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_pkey PRIMARY KEY (id);


--
-- Name: product_uoms product_uoms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_uoms
    ADD CONSTRAINT product_uoms_pkey PRIMARY KEY (id);


--
-- Name: product_uoms product_uoms_product_id_uom_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_uoms
    ADD CONSTRAINT product_uoms_product_id_uom_id_key UNIQUE (product_id, uom_id);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_product_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_product_number_key UNIQUE (product_number);


--
-- Name: products products_sku_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_sku_key UNIQUE (sku);


--
-- Name: purchase_order_items purchase_order_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_pkey PRIMARY KEY (id);


--
-- Name: purchase_orders purchase_orders_order_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_order_number_key UNIQUE (order_number);


--
-- Name: purchase_orders purchase_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_pkey PRIMARY KEY (id);


--
-- Name: quotation_attachments quotation_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_attachments
    ADD CONSTRAINT quotation_attachments_pkey PRIMARY KEY (id);


--
-- Name: quotation_emails quotation_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_emails
    ADD CONSTRAINT quotation_emails_pkey PRIMARY KEY (id);


--
-- Name: quotation_items quotation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT quotation_items_pkey PRIMARY KEY (id);


--
-- Name: quotation_status_history quotation_status_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_status_history
    ADD CONSTRAINT quotation_status_history_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);


--
-- Name: quotations quotations_quote_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_quote_number_key UNIQUE (quote_number);


--
-- Name: rbac_audit_logs rbac_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_audit_logs
    ADD CONSTRAINT rbac_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: rbac_permissions_catalog rbac_permissions_catalog_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_permissions_catalog
    ADD CONSTRAINT rbac_permissions_catalog_pkey PRIMARY KEY (key);


--
-- Name: rbac_role_permissions rbac_role_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_pkey PRIMARY KEY (role_id, permission_key);


--
-- Name: rbac_roles rbac_roles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT rbac_roles_name_unique UNIQUE (name);


--
-- Name: rbac_roles rbac_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_roles
    ADD CONSTRAINT rbac_roles_pkey PRIMARY KEY (id);


--
-- Name: rbac_user_roles rbac_user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_roles
    ADD CONSTRAINT rbac_user_roles_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: report_runs report_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_runs
    ADD CONSTRAINT report_runs_pkey PRIMARY KEY (id);


--
-- Name: route_deliveries route_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_deliveries
    ADD CONSTRAINT route_deliveries_pkey PRIMARY KEY (id);


--
-- Name: route_deliveries route_deliveries_route_id_delivery_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_deliveries
    ADD CONSTRAINT route_deliveries_route_id_delivery_order_id_key UNIQUE (route_id, delivery_order_id);


--
-- Name: route_deliveries route_deliveries_route_id_delivery_sequence_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_deliveries
    ADD CONSTRAINT route_deliveries_route_id_delivery_sequence_key UNIQUE (route_id, delivery_sequence);


--
-- Name: sale_discounts sale_discounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_discounts
    ADD CONSTRAINT sale_discounts_pkey PRIMARY KEY (id);


--
-- Name: sale_items sale_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: sales sales_sale_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_sale_number_key UNIQUE (sale_number);


--
-- Name: stock_count_lines stock_count_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT stock_count_lines_pkey PRIMARY KEY (id);


--
-- Name: stock_counts stock_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_pkey PRIMARY KEY (id);


--
-- Name: stock_movements stock_movements_movement_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_movement_number_key UNIQUE (movement_number);


--
-- Name: stock_movements stock_movements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_pkey PRIMARY KEY (id);


--
-- Name: system_backups system_backups_backup_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_backups
    ADD CONSTRAINT system_backups_backup_number_key UNIQUE (backup_number);


--
-- Name: system_backups system_backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_backups
    ADD CONSTRAINT system_backups_pkey PRIMARY KEY (id);


--
-- Name: system_maintenance_mode system_maintenance_mode_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_maintenance_mode
    ADD CONSTRAINT system_maintenance_mode_pkey PRIMARY KEY (id);


--
-- Name: system_reset_log system_reset_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_reset_log
    ADD CONSTRAINT system_reset_log_pkey PRIMARY KEY (id);


--
-- Name: system_reset_log system_reset_log_reset_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_reset_log
    ADD CONSTRAINT system_reset_log_reset_number_key UNIQUE (reset_number);


--
-- Name: system_settings system_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_pkey PRIMARY KEY (id);


--
-- Name: stock_count_lines unique_count_product_batch; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT unique_count_product_batch UNIQUE (stock_count_id, product_id, batch_id);


--
-- Name: quotation_items unique_line_number; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT unique_line_number UNIQUE (quotation_id, line_number);


--
-- Name: uoms uoms_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uoms
    ADD CONSTRAINT uoms_name_key UNIQUE (name);


--
-- Name: uoms uoms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uoms
    ADD CONSTRAINT uoms_pkey PRIMARY KEY (id);


--
-- Name: accounting_periods uq_accounting_period; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_periods
    ADD CONSTRAINT uq_accounting_period UNIQUE (period_year, period_month);


--
-- Name: ledger_transactions uq_ledger_transactions_reference; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT uq_ledger_transactions_reference UNIQUE ("ReferenceType", "ReferenceId");


--
-- Name: user_sessions user_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_user_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_user_number_key UNIQUE (user_number);


--
-- Name: IX_accounts_AccountClassification; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_accounts_AccountClassification" ON public.accounts USING btree ("AccountClassification");


--
-- Name: IX_accounts_AccountCode; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_accounts_AccountCode" ON public.accounts USING btree ("AccountCode");


--
-- Name: IX_accounts_AccountCode_IsActive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_accounts_AccountCode_IsActive" ON public.accounts USING btree ("AccountCode", "IsActive");


--
-- Name: IX_accounts_ParentAccountId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_accounts_ParentAccountId" ON public.accounts USING btree ("ParentAccountId");


--
-- Name: IX_credit_applications_ApplicationDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_credit_applications_ApplicationDate" ON public.credit_applications USING btree ("ApplicationDate");


--
-- Name: IX_credit_applications_CreditId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_credit_applications_CreditId" ON public.credit_applications USING btree ("CreditId");


--
-- Name: IX_credit_applications_CustomerCreditId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_credit_applications_CustomerCreditId" ON public.credit_applications USING btree ("CustomerCreditId");


--
-- Name: IX_credit_applications_InvoiceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_credit_applications_InvoiceId" ON public.credit_applications USING btree ("InvoiceId");


--
-- Name: IX_credit_applications_LedgerTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_credit_applications_LedgerTransactionId" ON public.credit_applications USING btree ("LedgerTransactionId");


--
-- Name: IX_customer_accounts_CustomerId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_customer_accounts_CustomerId" ON public.customer_accounts USING btree ("CustomerId");


--
-- Name: IX_customer_accounts_IsActive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_accounts_IsActive" ON public.customer_accounts USING btree ("IsActive");


--
-- Name: IX_customer_credits_CreditDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_credits_CreditDate" ON public.customer_credits USING btree ("CreditDate");


--
-- Name: IX_customer_credits_CustomerAccountId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_credits_CustomerAccountId" ON public.customer_credits USING btree ("CustomerAccountId");


--
-- Name: IX_customer_credits_CustomerAccountId1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_credits_CustomerAccountId1" ON public.customer_credits USING btree ("CustomerAccountId1");


--
-- Name: IX_customer_credits_LedgerTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_credits_LedgerTransactionId" ON public.customer_credits USING btree ("LedgerTransactionId");


--
-- Name: IX_customer_credits_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_credits_Status" ON public.customer_credits USING btree ("Status");


--
-- Name: IX_customer_deposits_CustomerAccountId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_deposits_CustomerAccountId" ON public.customer_deposits USING btree ("CustomerAccountId");


--
-- Name: IX_customer_deposits_CustomerAccountId1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_deposits_CustomerAccountId1" ON public.customer_deposits USING btree ("CustomerAccountId1");


--
-- Name: IX_customer_deposits_DepositDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_deposits_DepositDate" ON public.customer_deposits USING btree ("DepositDate");


--
-- Name: IX_customer_deposits_LedgerTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_deposits_LedgerTransactionId" ON public.customer_deposits USING btree ("LedgerTransactionId");


--
-- Name: IX_customer_deposits_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_deposits_Status" ON public.customer_deposits USING btree ("Status");


--
-- Name: IX_customer_payments_CustomerId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_payments_CustomerId" ON public.customer_payments USING btree ("CustomerId");


--
-- Name: IX_customer_payments_PaymentDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_payments_PaymentDate" ON public.customer_payments USING btree ("PaymentDate");


--
-- Name: IX_customer_payments_PaymentNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_customer_payments_PaymentNumber" ON public.customer_payments USING btree ("PaymentNumber");


--
-- Name: IX_customer_payments_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_customer_payments_Status" ON public.customer_payments USING btree ("Status");


--
-- Name: IX_deposit_applications_ApplicationDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_deposit_applications_ApplicationDate" ON public.deposit_applications USING btree ("ApplicationDate");


--
-- Name: IX_deposit_applications_CustomerDepositId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_deposit_applications_CustomerDepositId" ON public.deposit_applications USING btree ("CustomerDepositId");


--
-- Name: IX_deposit_applications_DepositId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_deposit_applications_DepositId" ON public.deposit_applications USING btree ("DepositId");


--
-- Name: IX_deposit_applications_InvoiceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_deposit_applications_InvoiceId" ON public.deposit_applications USING btree ("InvoiceId");


--
-- Name: IX_deposit_applications_LedgerTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_deposit_applications_LedgerTransactionId" ON public.deposit_applications USING btree ("LedgerTransactionId");


--
-- Name: IX_invoice_line_items_InvoiceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoice_line_items_InvoiceId" ON public.invoice_line_items USING btree ("InvoiceId");


--
-- Name: IX_invoice_line_items_InvoiceId_LineNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoice_line_items_InvoiceId_LineNumber" ON public.invoice_line_items USING btree ("InvoiceId", "LineNumber");


--
-- Name: IX_invoice_line_items_ProductId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoice_line_items_ProductId" ON public.invoice_line_items USING btree ("ProductId");


--
-- Name: IX_invoices_CustomerId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoices_CustomerId" ON public.invoices USING btree ("CustomerId");


--
-- Name: IX_invoices_DueDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoices_DueDate" ON public.invoices USING btree ("DueDate");


--
-- Name: IX_invoices_InvoiceDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoices_InvoiceDate" ON public.invoices USING btree ("InvoiceDate");


--
-- Name: IX_invoices_InvoiceNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_invoices_InvoiceNumber" ON public.invoices USING btree ("InvoiceNumber");


--
-- Name: IX_invoices_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_invoices_Status" ON public.invoices USING btree ("Status");


--
-- Name: IX_journal_entries_EntryDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entries_EntryDate" ON public.journal_entries USING btree ("EntryDate");


--
-- Name: IX_journal_entries_IdempotencyKey; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entries_IdempotencyKey" ON public.journal_entries USING btree ("IdempotencyKey");


--
-- Name: IX_journal_entries_SourceEntityType_SourceEntityId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entries_SourceEntityType_SourceEntityId" ON public.journal_entries USING btree ("SourceEntityType", "SourceEntityId");


--
-- Name: IX_journal_entries_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entries_Status" ON public.journal_entries USING btree ("Status");


--
-- Name: IX_journal_entries_TransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_journal_entries_TransactionId" ON public.journal_entries USING btree ("TransactionId");


--
-- Name: IX_journal_entries_VoidedByEntryId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entries_VoidedByEntryId" ON public.journal_entries USING btree ("VoidedByEntryId");


--
-- Name: IX_journal_entry_lines_AccountId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entry_lines_AccountId" ON public.journal_entry_lines USING btree ("AccountId");


--
-- Name: IX_journal_entry_lines_EntityType_EntityId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entry_lines_EntityType_EntityId" ON public.journal_entry_lines USING btree ("EntityType", "EntityId");


--
-- Name: IX_journal_entry_lines_JournalEntryId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entry_lines_JournalEntryId" ON public.journal_entry_lines USING btree ("JournalEntryId");


--
-- Name: IX_journal_entry_lines_TransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_journal_entry_lines_TransactionId" ON public.journal_entry_lines USING btree ("TransactionId");


--
-- Name: IX_ledger_entries_AccountId_TransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_entries_AccountId_TransactionId" ON public.ledger_entries USING btree ("AccountId", "TransactionId");


--
-- Name: IX_ledger_entries_JournalEntryLineId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_entries_JournalEntryLineId" ON public.ledger_entries USING btree ("JournalEntryLineId");


--
-- Name: IX_ledger_entries_LedgerTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_entries_LedgerTransactionId" ON public.ledger_entries USING btree ("LedgerTransactionId");


--
-- Name: IX_ledger_entries_TransactionId_LineNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_entries_TransactionId_LineNumber" ON public.ledger_entries USING btree ("TransactionId", "LineNumber");


--
-- Name: IX_ledger_transactions_OriginalTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_transactions_OriginalTransactionId" ON public.ledger_transactions USING btree ("OriginalTransactionId");


--
-- Name: IX_ledger_transactions_ReferenceType_ReferenceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_transactions_ReferenceType_ReferenceId" ON public.ledger_transactions USING btree ("ReferenceType", "ReferenceId");


--
-- Name: IX_ledger_transactions_ReversedByTransactionId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_transactions_ReversedByTransactionId" ON public.ledger_transactions USING btree ("ReversedByTransactionId");


--
-- Name: IX_ledger_transactions_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_transactions_Status" ON public.ledger_transactions USING btree ("Status");


--
-- Name: IX_ledger_transactions_TransactionDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_ledger_transactions_TransactionDate" ON public.ledger_transactions USING btree ("TransactionDate");


--
-- Name: IX_ledger_transactions_TransactionNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_ledger_transactions_TransactionNumber" ON public.ledger_transactions USING btree ("TransactionNumber");


--
-- Name: IX_payment_allocations_AllocationDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payment_allocations_AllocationDate" ON public.payment_allocations USING btree ("AllocationDate");


--
-- Name: IX_payment_allocations_InvoiceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payment_allocations_InvoiceId" ON public.payment_allocations USING btree ("InvoiceId");


--
-- Name: IX_payment_allocations_PaymentId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_payment_allocations_PaymentId" ON public.payment_allocations USING btree ("PaymentId");


--
-- Name: IX_processed_events_EntityType_EntityId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_processed_events_EntityType_EntityId" ON public.processed_events USING btree ("EntityType", "EntityId");


--
-- Name: IX_processed_events_EventType; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_processed_events_EventType" ON public.processed_events USING btree ("EventType");


--
-- Name: IX_processed_events_IdempotencyKey; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_processed_events_IdempotencyKey" ON public.processed_events USING btree ("IdempotencyKey");


--
-- Name: IX_processed_events_ProcessedAt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_processed_events_ProcessedAt" ON public.processed_events USING btree ("ProcessedAt");


--
-- Name: IX_supplier_invoice_line_items_ProductId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoice_line_items_ProductId" ON public.supplier_invoice_line_items USING btree ("ProductId");


--
-- Name: IX_supplier_invoice_line_items_SupplierInvoiceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoice_line_items_SupplierInvoiceId" ON public.supplier_invoice_line_items USING btree ("SupplierInvoiceId");


--
-- Name: IX_supplier_invoice_line_items_SupplierInvoiceId_LineNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoice_line_items_SupplierInvoiceId_LineNumber" ON public.supplier_invoice_line_items USING btree ("SupplierInvoiceId", "LineNumber");


--
-- Name: IX_supplier_invoices_DueDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoices_DueDate" ON public.supplier_invoices USING btree ("DueDate");


--
-- Name: IX_supplier_invoices_InvoiceDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoices_InvoiceDate" ON public.supplier_invoices USING btree ("InvoiceDate");


--
-- Name: IX_supplier_invoices_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoices_Status" ON public.supplier_invoices USING btree ("Status");


--
-- Name: IX_supplier_invoices_SupplierId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoices_SupplierId" ON public.supplier_invoices USING btree ("SupplierId");


--
-- Name: IX_supplier_invoices_SupplierInvoiceNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_invoices_SupplierInvoiceNumber" ON public.supplier_invoices USING btree ("SupplierInvoiceNumber");


--
-- Name: IX_supplier_payment_allocations_AllocationDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_payment_allocations_AllocationDate" ON public.supplier_payment_allocations USING btree ("AllocationDate");


--
-- Name: IX_supplier_payment_allocations_PaymentId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_payment_allocations_PaymentId" ON public.supplier_payment_allocations USING btree ("PaymentId");


--
-- Name: IX_supplier_payment_allocations_SupplierInvoiceId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_payment_allocations_SupplierInvoiceId" ON public.supplier_payment_allocations USING btree ("SupplierInvoiceId");


--
-- Name: IX_supplier_payments_PaymentDate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_payments_PaymentDate" ON public.supplier_payments USING btree ("PaymentDate");


--
-- Name: IX_supplier_payments_PaymentNumber; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_supplier_payments_PaymentNumber" ON public.supplier_payments USING btree ("PaymentNumber");


--
-- Name: IX_supplier_payments_Status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_payments_Status" ON public.supplier_payments USING btree ("Status");


--
-- Name: IX_supplier_payments_SupplierId; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_supplier_payments_SupplierId" ON public.supplier_payments USING btree ("SupplierId");


--
-- Name: IX_suppliers_CompanyName; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_suppliers_CompanyName" ON public.suppliers USING btree ("CompanyName");


--
-- Name: IX_suppliers_IsActive; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IX_suppliers_IsActive" ON public.suppliers USING btree ("IsActive");


--
-- Name: IX_suppliers_SupplierCode; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "IX_suppliers_SupplierCode" ON public.suppliers USING btree ("SupplierCode");


--
-- Name: idx_accounting_periods_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_periods_dates ON public.accounting_periods USING btree (period_start, period_end);


--
-- Name: idx_accounting_periods_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_periods_status ON public.accounting_periods USING btree (status);


--
-- Name: idx_accounting_periods_year_month; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_accounting_periods_year_month ON public.accounting_periods USING btree (period_year, period_month);


--
-- Name: idx_audit_log_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_action ON public.audit_log USING btree (action, created_at DESC);


--
-- Name: idx_audit_log_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_category ON public.audit_log USING btree (category);


--
-- Name: idx_audit_log_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);


--
-- Name: idx_audit_log_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);


--
-- Name: idx_audit_log_entity_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_entity_number ON public.audit_log USING btree (entity_number) WHERE (entity_number IS NOT NULL);


--
-- Name: idx_audit_log_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_session ON public.audit_log USING btree (session_id) WHERE (session_id IS NOT NULL);


--
-- Name: idx_audit_log_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_severity ON public.audit_log USING btree (severity) WHERE ((severity)::text = ANY ((ARRAY['ERROR'::character varying, 'CRITICAL'::character varying])::text[]));


--
-- Name: idx_audit_log_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_tags ON public.audit_log USING gin (tags);


--
-- Name: idx_audit_log_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_log_user ON public.audit_log USING btree (user_id, created_at DESC);


--
-- Name: idx_balance_adjustments_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_created_at ON public.customer_balance_adjustments USING btree (created_at);


--
-- Name: idx_balance_adjustments_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_balance_adjustments_customer_id ON public.customer_balance_adjustments USING btree (customer_id);


--
-- Name: idx_bank_accounts_account_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_accounts_account_code ON public.bank_accounts USING btree (account_code);


--
-- Name: idx_bank_accounts_account_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_accounts_account_type ON public.bank_accounts USING btree (account_type);


--
-- Name: idx_bank_accounts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_accounts_active ON public.bank_accounts USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_bank_accounts_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_bank_accounts_default ON public.bank_accounts USING btree (is_default) WHERE (is_default = true);


--
-- Name: idx_bank_accounts_gl; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_accounts_gl ON public.bank_accounts USING btree (gl_account_id);


--
-- Name: idx_bank_accounts_gl_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_accounts_gl_account ON public.bank_accounts USING btree (gl_account_id) WHERE (gl_account_id IS NOT NULL);


--
-- Name: idx_bank_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_alerts_status ON public.bank_alerts USING btree (status) WHERE ((status)::text = 'NEW'::text);


--
-- Name: idx_bank_patterns_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_patterns_active ON public.bank_patterns USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_bank_patterns_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_patterns_category ON public.bank_patterns USING btree (category_id);


--
-- Name: idx_bank_txn_account_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_txn_account_date ON public.bank_transactions USING btree (bank_account_id, transaction_date DESC);


--
-- Name: idx_bank_txn_reconciled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_txn_reconciled ON public.bank_transactions USING btree (is_reconciled) WHERE (is_reconciled = false);


--
-- Name: idx_bank_txn_reversed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_txn_reversed ON public.bank_transactions USING btree (is_reversed) WHERE (is_reversed = false);


--
-- Name: idx_bank_txn_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_txn_source ON public.bank_transactions USING btree (source_type, source_id) WHERE (source_id IS NOT NULL);


--
-- Name: idx_batches_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_expiry ON public.inventory_batches USING btree (expiry_date);


--
-- Name: idx_batches_fefo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_fefo ON public.inventory_batches USING btree (product_id, expiry_date, remaining_quantity);


--
-- Name: idx_batches_gr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_gr_id ON public.inventory_batches USING btree (goods_receipt_id);


--
-- Name: idx_batches_gr_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_gr_item_id ON public.inventory_batches USING btree (goods_receipt_item_id);


--
-- Name: idx_batches_po_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_po_id ON public.inventory_batches USING btree (purchase_order_id);


--
-- Name: idx_batches_po_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_po_item_id ON public.inventory_batches USING btree (purchase_order_item_id);


--
-- Name: idx_batches_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_product ON public.inventory_batches USING btree (product_id);


--
-- Name: idx_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_batches_status ON public.inventory_batches USING btree (status);


--
-- Name: idx_cashbook_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashbook_account ON public.cash_book_entries USING btree (bank_account_id);


--
-- Name: idx_cashbook_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashbook_date ON public.cash_book_entries USING btree (entry_date);


--
-- Name: idx_cashbook_entries_account_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashbook_entries_account_date ON public.cash_book_entries USING btree (bank_account_id, entry_date);


--
-- Name: idx_cashbook_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashbook_entries_date ON public.cash_book_entries USING btree (entry_date);


--
-- Name: idx_cashbook_entry_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashbook_entry_type ON public.cash_book_entries USING btree (entry_type);


--
-- Name: idx_cashbook_transaction_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cashbook_transaction_type ON public.cash_book_entries USING btree (transaction_type);


--
-- Name: idx_cost_layers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_active ON public.cost_layers USING btree (is_active);


--
-- Name: idx_cost_layers_active_remaining; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_active_remaining ON public.cost_layers USING btree (is_active, remaining_quantity) WHERE ((is_active = true) AND (remaining_quantity > (0)::numeric));


--
-- Name: idx_cost_layers_goods_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_goods_receipt ON public.cost_layers USING btree (goods_receipt_id) WHERE (goods_receipt_id IS NOT NULL);


--
-- Name: idx_cost_layers_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_product ON public.cost_layers USING btree (product_id);


--
-- Name: idx_cost_layers_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_product_id ON public.cost_layers USING btree (product_id);


--
-- Name: idx_cost_layers_received; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_received ON public.cost_layers USING btree (received_date);


--
-- Name: idx_cost_layers_received_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cost_layers_received_date ON public.cost_layers USING btree (product_id, received_date) WHERE (is_active = true);


--
-- Name: idx_customer_balance_audit_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_balance_audit_customer ON public.customer_balance_audit USING btree (customer_id, created_at DESC);


--
-- Name: idx_customer_groups_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_groups_active ON public.customer_groups USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_customer_groups_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_groups_name ON public.customer_groups USING btree (name);


--
-- Name: idx_customers_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_email ON public.customers USING btree (email);


--
-- Name: idx_customers_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_group ON public.customers USING btree (customer_group_id);


--
-- Name: idx_customers_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_number ON public.customers USING btree (customer_number);


--
-- Name: idx_customers_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customers_phone ON public.customers USING btree (phone);


--
-- Name: idx_delivery_items_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_items_batch ON public.delivery_items USING btree (batch_id);


--
-- Name: idx_delivery_items_delivery_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_items_delivery_order ON public.delivery_items USING btree (delivery_order_id);


--
-- Name: idx_delivery_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_items_product ON public.delivery_items USING btree (product_id);


--
-- Name: idx_delivery_orders_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_orders_customer_id ON public.delivery_orders USING btree (customer_id);


--
-- Name: idx_delivery_orders_delivery_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_orders_delivery_date ON public.delivery_orders USING btree (delivery_date);


--
-- Name: idx_delivery_orders_delivery_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_orders_delivery_number ON public.delivery_orders USING btree (delivery_number);


--
-- Name: idx_delivery_orders_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_orders_driver_id ON public.delivery_orders USING btree (assigned_driver_id);


--
-- Name: idx_delivery_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_orders_status ON public.delivery_orders USING btree (status);


--
-- Name: idx_delivery_orders_tracking_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_orders_tracking_number ON public.delivery_orders USING btree (tracking_number);


--
-- Name: idx_delivery_proof_delivery_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_proof_delivery_order_id ON public.delivery_proof USING btree (delivery_order_id);


--
-- Name: idx_delivery_routes_driver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_routes_driver_id ON public.delivery_routes USING btree (driver_id);


--
-- Name: idx_delivery_routes_route_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_routes_route_date ON public.delivery_routes USING btree (route_date);


--
-- Name: idx_delivery_status_history_delivery_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_status_history_delivery_order_id ON public.delivery_status_history USING btree (delivery_order_id);


--
-- Name: idx_delivery_status_history_status_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_delivery_status_history_status_date ON public.delivery_status_history USING btree (status_date);


--
-- Name: idx_deposit_applications_deposit; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deposit_applications_deposit ON public.pos_deposit_applications USING btree (deposit_id);


--
-- Name: idx_deposit_applications_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deposit_applications_sale ON public.pos_deposit_applications USING btree (sale_id);


--
-- Name: idx_discount_auth_approver; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discount_auth_approver ON public.discount_authorizations USING btree (approved_by, approved_at) WHERE (approved_by IS NOT NULL);


--
-- Name: idx_discount_auth_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discount_auth_sale ON public.discount_authorizations USING btree (sale_id);


--
-- Name: idx_discount_auth_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discount_auth_status ON public.discount_authorizations USING btree (status, created_at) WHERE ((status)::text = 'PENDING'::text);


--
-- Name: idx_discount_rules_discount; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discount_rules_discount ON public.discount_rules USING btree (discount_id);


--
-- Name: idx_discounts_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_discounts_active ON public.discounts USING btree (is_active, valid_from, valid_until) WHERE (is_active = true);


--
-- Name: idx_expense_approvals_approver_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_approvals_approver_id ON public.expense_approvals USING btree (approver_id);


--
-- Name: idx_expense_approvals_expense_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_approvals_expense_id ON public.expense_approvals USING btree (expense_id);


--
-- Name: idx_expense_documents_expense_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expense_documents_expense_id ON public.expense_documents USING btree (expense_id);


--
-- Name: idx_expenses_category_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_category_id ON public.expenses USING btree (category_id);


--
-- Name: idx_expenses_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_created_by ON public.expenses USING btree (created_by);


--
-- Name: idx_expenses_expense_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_expense_date ON public.expenses USING btree (expense_date);


--
-- Name: idx_expenses_expense_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_expense_number ON public.expenses USING btree (expense_number);


--
-- Name: idx_expenses_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_status ON public.expenses USING btree (status);


--
-- Name: idx_expenses_supplier_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_expenses_supplier_id ON public.expenses USING btree (supplier_id);


--
-- Name: idx_failed_transactions_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_transactions_created ON public.failed_transactions USING btree (created_at DESC);


--
-- Name: idx_failed_transactions_error_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_transactions_error_type ON public.failed_transactions USING btree (error_type);


--
-- Name: idx_failed_transactions_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_transactions_type ON public.failed_transactions USING btree (transaction_type, created_at DESC);


--
-- Name: idx_failed_transactions_unresolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_transactions_unresolved ON public.failed_transactions USING btree (created_at DESC) WHERE (resolved_at IS NULL);


--
-- Name: idx_failed_transactions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_failed_transactions_user ON public.failed_transactions USING btree (user_id) WHERE (user_id IS NOT NULL);


--
-- Name: idx_financial_periods_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_dates ON public.financial_periods USING btree (start_date, end_date);


--
-- Name: idx_financial_periods_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_periods_type ON public.financial_periods USING btree (period_type);


--
-- Name: idx_gr_delivery_note; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_delivery_note ON public.goods_receipts USING btree (delivery_note_number);


--
-- Name: idx_gr_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_invoice ON public.goods_receipts USING btree (invoice_number);


--
-- Name: idx_gr_items_po_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_items_po_item ON public.goods_receipt_items USING btree (po_item_id);


--
-- Name: idx_gr_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_items_product ON public.goods_receipt_items USING btree (product_id);


--
-- Name: idx_gr_items_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_items_receipt ON public.goods_receipt_items USING btree (goods_receipt_id);


--
-- Name: idx_gr_items_uom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_items_uom ON public.goods_receipt_items USING btree (uom_id);


--
-- Name: idx_gr_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_number ON public.goods_receipts USING btree (receipt_number);


--
-- Name: idx_gr_po; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_po ON public.goods_receipts USING btree (purchase_order_id);


--
-- Name: idx_gr_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gr_status ON public.goods_receipts USING btree (status);


--
-- Name: idx_inventory_snapshots_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_snapshots_batch ON public.inventory_snapshots USING btree (batch_id);


--
-- Name: idx_inventory_snapshots_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_snapshots_date ON public.inventory_snapshots USING btree (snapshot_date);


--
-- Name: idx_inventory_snapshots_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_inventory_snapshots_product ON public.inventory_snapshots USING btree (product_id);


--
-- Name: idx_invoice_payments_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_date ON public.invoice_payments USING btree (payment_date);


--
-- Name: idx_invoice_payments_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoice_payments_invoice ON public.invoice_payments USING btree (invoice_id);


--
-- Name: idx_invoice_settings_singleton; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_invoice_settings_singleton ON public.invoice_settings USING btree ((1));


--
-- Name: idx_ledger_entries_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entries_account ON public.ledger_entries USING btree ("AccountId");


--
-- Name: idx_ledger_entries_transaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_entries_transaction ON public.ledger_entries USING btree ("LedgerTransactionId");


--
-- Name: idx_ledger_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_transactions_date ON public.ledger_transactions USING btree ("TransactionDate");


--
-- Name: idx_ledger_transactions_idempotency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_transactions_idempotency ON public.ledger_transactions USING btree ("IdempotencyKey");


--
-- Name: idx_ledger_transactions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ledger_transactions_status ON public.ledger_transactions USING btree ("Status");


--
-- Name: idx_mje_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mje_created_at ON public.manual_journal_entries USING btree (created_at);


--
-- Name: idx_mje_entry_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mje_entry_date ON public.manual_journal_entries USING btree (entry_date);


--
-- Name: idx_mje_entry_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mje_entry_number ON public.manual_journal_entries USING btree (entry_number);


--
-- Name: idx_mje_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mje_status ON public.manual_journal_entries USING btree (status);


--
-- Name: idx_mjel_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mjel_account_id ON public.manual_journal_entry_lines USING btree (account_id);


--
-- Name: idx_mjel_entity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mjel_entity ON public.manual_journal_entry_lines USING btree (entity_type, entity_id);


--
-- Name: idx_mjel_journal_entry_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mjel_journal_entry_id ON public.manual_journal_entry_lines USING btree (journal_entry_id);


--
-- Name: idx_movements_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_batch ON public.stock_movements USING btree (batch_id);


--
-- Name: idx_movements_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_product ON public.stock_movements USING btree (product_id);


--
-- Name: idx_movements_reference; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_reference ON public.stock_movements USING btree (reference_type, reference_id);


--
-- Name: idx_movements_session; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_session ON public.cash_movements USING btree (session_id);


--
-- Name: idx_movements_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_type ON public.stock_movements USING btree (movement_type);


--
-- Name: idx_movements_uom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_movements_uom ON public.stock_movements USING btree (uom_id);


--
-- Name: idx_mv_daily_sales; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_daily_sales ON public.mv_daily_sales_summary USING btree (sale_day);


--
-- Name: idx_mv_expense_summary; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_expense_summary ON public.mv_expense_summary USING btree (category_id, month);


--
-- Name: idx_payment_lines_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_lines_created_at ON public.payment_lines USING btree (created_at);


--
-- Name: idx_payment_lines_payment_method; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_lines_payment_method ON public.payment_lines USING btree (payment_method);


--
-- Name: idx_payment_lines_sale_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_lines_sale_id ON public.payment_lines USING btree (sale_id);


--
-- Name: idx_payment_transactions_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_date ON public.payment_transactions USING btree (transaction_date);


--
-- Name: idx_payment_transactions_payment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_transactions_payment ON public.payment_transactions USING btree (supplier_payment_id);


--
-- Name: idx_period_history_period; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_period_history_period ON public.accounting_period_history USING btree (period_id);


--
-- Name: idx_po_invoice_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_invoice_number ON public.purchase_orders USING btree (invoice_number);


--
-- Name: idx_po_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_items_order ON public.purchase_order_items USING btree (purchase_order_id);


--
-- Name: idx_po_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_items_product ON public.purchase_order_items USING btree (product_id);


--
-- Name: idx_po_items_uom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_items_uom ON public.purchase_order_items USING btree (uom_id);


--
-- Name: idx_po_manual_receipt; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_manual_receipt ON public.purchase_orders USING btree (manual_receipt);


--
-- Name: idx_po_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_number ON public.purchase_orders USING btree (order_number);


--
-- Name: idx_po_payment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_payment_status ON public.purchase_orders USING btree (payment_status);


--
-- Name: idx_po_sent_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_sent_date ON public.purchase_orders USING btree (sent_to_supplier_at);


--
-- Name: idx_po_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_status ON public.purchase_orders USING btree (status);


--
-- Name: idx_po_supplier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_po_supplier ON public.purchase_orders USING btree (supplier_id);


--
-- Name: idx_pos_deposits_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_deposits_active ON public.pos_customer_deposits USING btree (customer_id, status) WHERE ((status)::text = 'ACTIVE'::text);


--
-- Name: idx_pos_deposits_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_deposits_customer ON public.pos_customer_deposits USING btree (customer_id);


--
-- Name: idx_pos_deposits_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_deposits_status ON public.pos_customer_deposits USING btree (status);


--
-- Name: idx_pos_held_order_items_hold_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_order_items_hold_id ON public.pos_held_order_items USING btree (hold_id);


--
-- Name: idx_pos_held_order_items_line_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_order_items_line_order ON public.pos_held_order_items USING btree (hold_id, line_order);


--
-- Name: idx_pos_held_order_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_order_items_product_id ON public.pos_held_order_items USING btree (product_id);


--
-- Name: idx_pos_held_orders_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_orders_created_at ON public.pos_held_orders USING btree (created_at DESC);


--
-- Name: idx_pos_held_orders_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_orders_expires_at ON public.pos_held_orders USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_pos_held_orders_hold_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_orders_hold_number ON public.pos_held_orders USING btree (hold_number);


--
-- Name: idx_pos_held_orders_terminal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_orders_terminal_id ON public.pos_held_orders USING btree (terminal_id) WHERE (terminal_id IS NOT NULL);


--
-- Name: idx_pos_held_orders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pos_held_orders_user_id ON public.pos_held_orders USING btree (user_id);


--
-- Name: idx_pricing_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_active ON public.pricing_tiers USING btree (is_active);


--
-- Name: idx_pricing_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_group ON public.pricing_tiers USING btree (customer_group_id);


--
-- Name: idx_pricing_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_product ON public.pricing_tiers USING btree (product_id);


--
-- Name: idx_pricing_tiers_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_tiers_active ON public.pricing_tiers USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_pricing_tiers_customer_group_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_tiers_customer_group_id ON public.pricing_tiers USING btree (customer_group_id) WHERE (customer_group_id IS NOT NULL);


--
-- Name: idx_pricing_tiers_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_tiers_lookup ON public.pricing_tiers USING btree (product_id, customer_group_id, min_quantity, is_active) WHERE (is_active = true);


--
-- Name: idx_pricing_tiers_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_tiers_priority ON public.pricing_tiers USING btree (product_id, priority DESC) WHERE (is_active = true);


--
-- Name: idx_pricing_tiers_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_tiers_product_id ON public.pricing_tiers USING btree (product_id);


--
-- Name: idx_product_uoms_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_uoms_product ON public.product_uoms USING btree (product_id);


--
-- Name: idx_product_uoms_uom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_product_uoms_uom ON public.product_uoms USING btree (uom_id);


--
-- Name: idx_products_auto_update; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_auto_update ON public.products USING btree (auto_update_price) WHERE (auto_update_price = true);


--
-- Name: idx_products_barcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_barcode ON public.products USING btree (barcode);


--
-- Name: idx_products_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_category ON public.products USING btree (category);


--
-- Name: idx_products_has_tax; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_has_tax ON public.products USING btree (has_tax);


--
-- Name: idx_products_income_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_income_account ON public.products USING btree (income_account_id) WHERE (income_account_id IS NOT NULL);


--
-- Name: idx_products_is_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_is_service ON public.products USING btree (is_service) WHERE (is_service = true);


--
-- Name: idx_products_is_taxable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_is_taxable ON public.products USING btree (is_taxable);


--
-- Name: idx_products_min_price; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_min_price ON public.products USING btree (min_price) WHERE (min_price IS NOT NULL);


--
-- Name: idx_products_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_name ON public.products USING btree (name);


--
-- Name: idx_products_product_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_product_number ON public.products USING btree (product_number);


--
-- Name: idx_products_product_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_product_type ON public.products USING btree (product_type);


--
-- Name: idx_products_sku; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_sku ON public.products USING btree (sku);


--
-- Name: idx_products_tax_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tax_mode ON public.products USING btree (tax_mode);


--
-- Name: idx_products_tax_rate; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tax_rate ON public.products USING btree (tax_rate);


--
-- Name: idx_products_track_expiry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_track_expiry ON public.products USING btree (track_expiry);


--
-- Name: idx_products_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_type ON public.products USING btree (product_type);


--
-- Name: idx_quotation_items_line_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotation_items_line_number ON public.quotation_items USING btree (quotation_id, line_number);


--
-- Name: idx_quotation_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotation_items_product ON public.quotation_items USING btree (product_id);


--
-- Name: idx_quotation_items_product_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotation_items_product_id ON public.quotation_items USING btree (product_id);


--
-- Name: idx_quotation_items_quotation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotation_items_quotation_id ON public.quotation_items USING btree (quotation_id);


--
-- Name: idx_quotation_items_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotation_items_quote ON public.quotation_items USING btree (quotation_id);


--
-- Name: idx_quotations_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_assigned_to ON public.quotations USING btree (assigned_to_id);


--
-- Name: idx_quotations_conversion; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_conversion ON public.quotations USING btree (converted_to_sale_id, converted_to_invoice_id);


--
-- Name: idx_quotations_converted_invoice; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_converted_invoice ON public.quotations USING btree (converted_to_invoice_id);


--
-- Name: idx_quotations_converted_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_converted_sale ON public.quotations USING btree (converted_to_sale_id);


--
-- Name: idx_quotations_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_created_at ON public.quotations USING btree (created_at);


--
-- Name: idx_quotations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_created_by ON public.quotations USING btree (created_by_id);


--
-- Name: idx_quotations_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_customer ON public.quotations USING btree (customer_id);


--
-- Name: idx_quotations_customer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_customer_id ON public.quotations USING btree (customer_id);


--
-- Name: idx_quotations_customer_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_customer_status ON public.quotations USING btree (customer_id, status);


--
-- Name: idx_quotations_expiry_check; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_expiry_check ON public.quotations USING btree (status, valid_until) WHERE (status <> ALL (ARRAY['CONVERTED'::public.quotation_status, 'CANCELLED'::public.quotation_status, 'EXPIRED'::public.quotation_status]));


--
-- Name: idx_quotations_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_parent ON public.quotations USING btree (parent_quote_id);


--
-- Name: idx_quotations_quote_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_quote_number ON public.quotations USING btree (quote_number);


--
-- Name: idx_quotations_quote_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_quote_type ON public.quotations USING btree (quote_type);


--
-- Name: idx_quotations_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_search ON public.quotations USING gin (to_tsvector('english'::regconfig, (((((COALESCE(quote_number, ''::character varying))::text || ' '::text) || (COALESCE(customer_name, ''::character varying))::text) || ' '::text) || (COALESCE(reference, ''::character varying))::text)));


--
-- Name: idx_quotations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_status ON public.quotations USING btree (status);


--
-- Name: idx_quotations_status_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_status_type ON public.quotations USING btree (status, quote_type);


--
-- Name: idx_quotations_valid_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quotations_valid_until ON public.quotations USING btree (valid_until);


--
-- Name: idx_quote_attachments_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_attachments_quote ON public.quotation_attachments USING btree (quotation_id);


--
-- Name: idx_quote_emails_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_emails_quote ON public.quotation_emails USING btree (quotation_id);


--
-- Name: idx_quote_emails_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_emails_sent_at ON public.quotation_emails USING btree (sent_at);


--
-- Name: idx_quote_status_history_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_status_history_date ON public.quotation_status_history USING btree (changed_at);


--
-- Name: idx_quote_status_history_quote; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_quote_status_history_quote ON public.quotation_status_history USING btree (quotation_id);


--
-- Name: idx_rbac_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_audit_logs_action ON public.rbac_audit_logs USING btree (action);


--
-- Name: idx_rbac_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_audit_logs_actor ON public.rbac_audit_logs USING btree (actor_user_id);


--
-- Name: idx_rbac_audit_logs_target_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_audit_logs_target_role ON public.rbac_audit_logs USING btree (target_role_id) WHERE (target_role_id IS NOT NULL);


--
-- Name: idx_rbac_audit_logs_target_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_audit_logs_target_user ON public.rbac_audit_logs USING btree (target_user_id) WHERE (target_user_id IS NOT NULL);


--
-- Name: idx_rbac_audit_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_audit_logs_timestamp ON public.rbac_audit_logs USING btree ("timestamp" DESC);


--
-- Name: idx_rbac_role_permissions_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_role_permissions_key ON public.rbac_role_permissions USING btree (permission_key);


--
-- Name: idx_rbac_roles_is_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_roles_is_active ON public.rbac_roles USING btree (is_active);


--
-- Name: idx_rbac_roles_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_roles_name ON public.rbac_roles USING btree (lower((name)::text));


--
-- Name: idx_rbac_user_roles_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_roles_active ON public.rbac_user_roles USING btree (user_id, is_active);


--
-- Name: idx_rbac_user_roles_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_roles_expires ON public.rbac_user_roles USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_rbac_user_roles_role_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_roles_role_id ON public.rbac_user_roles USING btree (role_id);


--
-- Name: idx_rbac_user_roles_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_rbac_user_roles_unique ON public.rbac_user_roles USING btree (user_id, role_id, COALESCE(scope_type, ''::character varying), COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));


--
-- Name: idx_rbac_user_roles_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_rbac_user_roles_user_id ON public.rbac_user_roles USING btree (user_id);


--
-- Name: idx_reconciliations_bank_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconciliations_bank_account ON public.bank_reconciliations USING btree (bank_account_id);


--
-- Name: idx_reconciliations_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconciliations_date ON public.bank_reconciliations USING btree (reconciliation_date);


--
-- Name: idx_reconciliations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reconciliations_status ON public.bank_reconciliations USING btree (status);


--
-- Name: idx_refresh_tokens_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_family ON public.refresh_tokens USING btree (family_id);


--
-- Name: idx_refresh_tokens_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_refresh_tokens_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_user ON public.refresh_tokens USING btree (user_id);


--
-- Name: idx_report_runs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_runs_created ON public.report_runs USING btree (created_at);


--
-- Name: idx_report_runs_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_runs_type ON public.report_runs USING btree (report_type);


--
-- Name: idx_report_runs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_report_runs_user ON public.report_runs USING btree (generated_by_id);


--
-- Name: idx_route_deliveries_delivery_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_deliveries_delivery_order_id ON public.route_deliveries USING btree (delivery_order_id);


--
-- Name: idx_route_deliveries_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_deliveries_route_id ON public.route_deliveries USING btree (route_id);


--
-- Name: idx_sale_discounts_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_discounts_item ON public.sale_discounts USING btree (sale_item_id) WHERE (sale_item_id IS NOT NULL);


--
-- Name: idx_sale_discounts_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_discounts_sale ON public.sale_discounts USING btree (sale_id);


--
-- Name: idx_sale_items_income_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_income_account ON public.sale_items USING btree (income_account_id) WHERE (income_account_id IS NOT NULL);


--
-- Name: idx_sale_items_is_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_is_service ON public.sale_items USING btree (is_service) WHERE (is_service = true);


--
-- Name: idx_sale_items_item_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_item_type ON public.sale_items USING btree (item_type);


--
-- Name: idx_sale_items_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_product ON public.sale_items USING btree (product_id);


--
-- Name: idx_sale_items_product_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_product_type ON public.sale_items USING btree (product_type);


--
-- Name: idx_sale_items_sale; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_sale ON public.sale_items USING btree (sale_id);


--
-- Name: idx_sale_items_uom; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sale_items_uom ON public.sale_items USING btree (uom_id);


--
-- Name: idx_sales_cashier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_cashier ON public.sales USING btree (cashier_id);


--
-- Name: idx_sales_customer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_customer ON public.sales USING btree (customer_id);


--
-- Name: idx_sales_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_date ON public.sales USING btree (sale_date);


--
-- Name: idx_sales_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_number ON public.sales USING btree (sale_number);


--
-- Name: idx_sales_quote_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_quote_id ON public.sales USING btree (quote_id);


--
-- Name: idx_sales_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_status ON public.sales USING btree (status);


--
-- Name: idx_sales_voided_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_voided_at ON public.sales USING btree (voided_at) WHERE (voided_at IS NOT NULL);


--
-- Name: idx_sales_voided_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_voided_by ON public.sales USING btree (voided_by_id) WHERE (voided_by_id IS NOT NULL);


--
-- Name: idx_sessions_register; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_register ON public.cash_register_sessions USING btree (register_id);


--
-- Name: idx_sessions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_status ON public.cash_register_sessions USING btree (status);


--
-- Name: idx_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sessions_user ON public.cash_register_sessions USING btree (user_id);


--
-- Name: idx_stmt_lines_statement; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stmt_lines_statement ON public.bank_statement_lines USING btree (statement_id);


--
-- Name: idx_stmt_lines_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stmt_lines_status ON public.bank_statement_lines USING btree (match_status);


--
-- Name: idx_stock_count_lines_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_count_lines_batch ON public.stock_count_lines USING btree (batch_id);


--
-- Name: idx_stock_count_lines_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_count_lines_count ON public.stock_count_lines USING btree (stock_count_id);


--
-- Name: idx_stock_count_lines_product; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_count_lines_product ON public.stock_count_lines USING btree (product_id);


--
-- Name: idx_stock_counts_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_counts_created_at ON public.stock_counts USING btree (created_at DESC);


--
-- Name: idx_stock_counts_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_counts_created_by ON public.stock_counts USING btree (created_by_id);


--
-- Name: idx_stock_counts_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_counts_state ON public.stock_counts USING btree (state);


--
-- Name: idx_stock_movements_stock_count; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stock_movements_stock_count ON public.stock_movements USING btree (stock_count_id);


--
-- Name: idx_system_backups_backup_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_backups_backup_number ON public.system_backups USING btree (backup_number);


--
-- Name: idx_system_backups_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_backups_created_at ON public.system_backups USING btree (created_at DESC);


--
-- Name: idx_system_backups_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_backups_status ON public.system_backups USING btree (status) WHERE (is_deleted = false);


--
-- Name: idx_system_reset_log_authorized_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_reset_log_authorized_by ON public.system_reset_log USING btree (authorized_by);


--
-- Name: idx_system_reset_log_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_reset_log_started_at ON public.system_reset_log USING btree (started_at DESC);


--
-- Name: idx_system_settings_updated_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_settings_updated_at ON public.system_settings USING btree (updated_at DESC);


--
-- Name: idx_transfers_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_date ON public.cash_bank_transfers USING btree (transfer_date);


--
-- Name: idx_transfers_from_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_from_account ON public.cash_bank_transfers USING btree (from_account_id);


--
-- Name: idx_transfers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_status ON public.cash_bank_transfers USING btree (status);


--
-- Name: idx_transfers_to_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_to_account ON public.cash_bank_transfers USING btree (to_account_id);


--
-- Name: idx_transfers_transfer_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transfers_transfer_number ON public.cash_bank_transfers USING btree (transfer_number);


--
-- Name: idx_user_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_active ON public.user_sessions USING btree (is_active, last_activity_at) WHERE (is_active = true);


--
-- Name: idx_user_sessions_logout; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_logout ON public.user_sessions USING btree (logout_at) WHERE (logout_at IS NOT NULL);


--
-- Name: idx_user_sessions_terminal; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_terminal ON public.user_sessions USING btree (terminal_id) WHERE (terminal_id IS NOT NULL);


--
-- Name: idx_user_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_sessions_user ON public.user_sessions USING btree (user_id, login_at DESC);


--
-- Name: idx_users_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_email ON public.users USING btree (email);


--
-- Name: idx_users_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_role ON public.users USING btree (role);


--
-- Name: idx_users_user_number; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_user_number ON public.users USING btree (user_number);


--
-- Name: ux_product_uoms_default; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_product_uoms_default ON public.product_uoms USING btree (product_id) WHERE (is_default = true);


--
-- Name: expense_approvals expense_approvals_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expense_approvals_updated_at BEFORE UPDATE ON public.expense_approvals FOR EACH ROW EXECUTE FUNCTION public.update_expense_updated_at();


--
-- Name: expense_categories expense_categories_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expense_categories_updated_at BEFORE UPDATE ON public.expense_categories FOR EACH ROW EXECUTE FUNCTION public.update_expense_updated_at();


--
-- Name: expenses expenses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER expenses_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.update_expense_updated_at();


--
-- Name: ledger_transactions tr_prevent_posted_modification; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_prevent_posted_modification BEFORE UPDATE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.prevent_posted_modification();


--
-- Name: quotations tr_protect_converted_quotation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_protect_converted_quotation BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.fn_protect_converted_quotation();


--
-- Name: TRIGGER tr_protect_converted_quotation ON quotations; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER tr_protect_converted_quotation ON public.quotations IS 'Prevents status changes on converted quotations - once a deal is closed, it cannot be modified';


--
-- Name: ledger_transactions tr_validate_period_open; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_validate_period_open BEFORE INSERT ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.validate_period_open();


--
-- Name: ledger_transactions tr_validate_transaction_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER tr_validate_transaction_balance BEFORE INSERT ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.validate_transaction_balance();


--
-- Name: customers trg_audit_customer_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_audit_customer_balance AFTER UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.audit_customer_balance_change();


--
-- Name: goods_receipt_items trg_auto_populate_gr_po_item_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_populate_gr_po_item_id BEFORE INSERT ON public.goods_receipt_items FOR EACH ROW EXECUTE FUNCTION public.auto_populate_gr_po_item_id();


--
-- Name: sales trg_check_credit_sale_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_credit_sale_customer BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.check_credit_sale_customer();


--
-- Name: inventory_batches trg_check_inventory_not_negative; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_check_inventory_not_negative BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.check_inventory_not_negative();


--
-- Name: journal_entry_lines trg_check_journal_entry_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER trg_check_journal_entry_balance AFTER INSERT OR UPDATE ON public.journal_entry_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_journal_entry_balance();


--
-- Name: cost_layers trg_cost_layer_gl_failsafe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cost_layer_gl_failsafe BEFORE INSERT ON public.cost_layers FOR EACH ROW EXECUTE FUNCTION public.fn_post_cost_layer_to_gl();


--
-- Name: TRIGGER trg_cost_layer_gl_failsafe ON cost_layers; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_cost_layer_gl_failsafe ON public.cost_layers IS 'Failsafe trigger: Auto-posts GL entries (DR Inventory 1300, CR Opening Balance Equity 3200) 
when cost layers are created without a goods_receipt_id. Prevents GL/subledger discrepancies.
Created: 2026-01-01';


--
-- Name: cost_layers trg_cost_layers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cost_layers_updated_at BEFORE UPDATE ON public.cost_layers FOR EACH ROW EXECUTE FUNCTION public.update_cost_layers_updated_at();


--
-- Name: customer_groups trg_customer_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_groups_updated_at BEFORE UPDATE ON public.customer_groups FOR EACH ROW EXECUTE FUNCTION public.update_customer_groups_updated_at();


--
-- Name: delivery_orders trg_delivery_orders_update_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_delivery_orders_update_timestamp BEFORE UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.update_delivery_timestamps();


--
-- Name: delivery_routes trg_delivery_routes_update_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_delivery_routes_update_timestamp BEFORE UPDATE ON public.delivery_routes FOR EACH ROW EXECUTE FUNCTION public.update_delivery_timestamps();


--
-- Name: goods_receipts trg_enforce_period_goods_receipts; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_period_goods_receipts BEFORE INSERT OR UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_open_period();


--
-- Name: invoice_payments trg_enforce_period_invoice_payments; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_period_invoice_payments BEFORE INSERT OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_open_period();


--
-- Name: journal_entries trg_enforce_period_journal_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_period_journal_entries BEFORE INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_open_period();


--
-- Name: ledger_entries trg_enforce_period_ledger_entries; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_period_ledger_entries BEFORE INSERT OR UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_open_period();


--
-- Name: ledger_transactions trg_enforce_period_ledger_transactions; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_period_ledger_transactions BEFORE INSERT OR UPDATE ON public.ledger_transactions FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_open_period();


--
-- Name: sales trg_enforce_period_sales; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_period_sales BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.fn_enforce_open_period();


--
-- Name: pos_customer_deposits trg_generate_deposit_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_deposit_number BEFORE INSERT ON public.pos_customer_deposits FOR EACH ROW EXECUTE FUNCTION public.generate_deposit_number();


--
-- Name: quotations trg_generate_quote_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_quote_number BEFORE INSERT ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.generate_quote_number();


--
-- Name: delivery_orders trg_generate_tracking_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_generate_tracking_number BEFORE INSERT ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.generate_tracking_number();


--
-- Name: invoice_payments trg_invoice_payment_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_payment_sync AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.fn_sync_invoice_payment();


--
-- Name: quotations trg_log_quote_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_quote_status_change AFTER UPDATE ON public.quotations FOR EACH ROW WHEN ((old.status IS DISTINCT FROM new.status)) EXECUTE FUNCTION public.log_quotation_status_change();


--
-- Name: inventory_batches trg_log_stock_movement; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_log_stock_movement AFTER INSERT OR DELETE OR UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.fn_log_stock_movement();


--
-- Name: purchase_orders trg_maintenance_check_po; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_maintenance_check_po BEFORE INSERT OR DELETE OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.check_maintenance_mode();


--
-- Name: sales trg_maintenance_check_sales; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_maintenance_check_sales BEFORE INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.check_maintenance_mode();


--
-- Name: manual_journal_entries trg_manual_je_period_check; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_manual_je_period_check BEFORE INSERT ON public.manual_journal_entries FOR EACH ROW EXECUTE FUNCTION public.trg_enforce_open_period_manual_je();


--
-- Name: pos_customer_deposits trg_post_customer_deposit_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_customer_deposit_to_ledger AFTER INSERT ON public.pos_customer_deposits FOR EACH ROW EXECUTE FUNCTION public.fn_post_customer_deposit_to_ledger();


--
-- Name: invoices trg_post_customer_invoice_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_customer_invoice_to_ledger AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_post_customer_invoice_to_ledger();


--
-- Name: customer_payments trg_post_customer_payment_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_customer_payment_to_ledger AFTER INSERT ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.fn_post_customer_payment_to_ledger();


--
-- Name: pos_deposit_applications trg_post_deposit_application_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_deposit_application_to_ledger AFTER INSERT ON public.pos_deposit_applications FOR EACH ROW EXECUTE FUNCTION public.fn_post_deposit_application_to_ledger();


--
-- Name: expenses trg_post_expense_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_expense_to_ledger AFTER INSERT OR UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.fn_post_expense_to_ledger();


--
-- Name: goods_receipts trg_post_goods_receipt_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_goods_receipt_to_ledger AFTER INSERT OR UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.fn_post_goods_receipt_to_ledger();


--
-- Name: invoice_payments trg_post_invoice_payment_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_invoice_payment_to_ledger AFTER INSERT ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.fn_post_invoice_payment_to_ledger();


--
-- Name: sales trg_post_sale_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_sale_to_ledger AFTER INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.fn_post_sale_to_ledger();


--
-- Name: sales trg_post_sale_void_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_sale_void_to_ledger AFTER UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.fn_post_sale_void_to_ledger();


--
-- Name: stock_movements trg_post_stock_movement_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_stock_movement_to_ledger AFTER INSERT ON public.stock_movements FOR EACH ROW EXECUTE FUNCTION public.fn_post_stock_movement_to_ledger();


--
-- Name: supplier_invoices trg_post_supplier_invoice_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_supplier_invoice_to_ledger AFTER INSERT OR UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_post_supplier_invoice_to_ledger();


--
-- Name: supplier_payments trg_post_supplier_payment_to_ledger; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_post_supplier_payment_to_ledger AFTER INSERT ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.fn_post_supplier_payment_to_ledger();


--
-- Name: inventory_batches trg_prevent_ghost_batches; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_ghost_batches BEFORE INSERT ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.prevent_ghost_batches();


--
-- Name: invoice_payments trg_prevent_invoice_overpayment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_prevent_invoice_overpayment BEFORE INSERT ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.fn_prevent_invoice_overpayment();


--
-- Name: pricing_tiers trg_pricing_tiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_pricing_tiers_updated_at BEFORE UPDATE ON public.pricing_tiers FOR EACH ROW EXECUTE FUNCTION public.update_pricing_tiers_updated_at();


--
-- Name: customers trg_protect_customer_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_protect_customer_balance BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.protect_computed_balances();


--
-- Name: sale_items trg_sale_items_set_product_type; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sale_items_set_product_type BEFORE INSERT ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.fn_sale_items_set_product_type();


--
-- Name: TRIGGER trg_sale_items_set_product_type ON sale_items; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TRIGGER trg_sale_items_set_product_type ON public.sale_items IS 'Auto-populates product_type and income_account_id from products table on insert. Ensures proper GL account selection for revenue posting.';


--
-- Name: pos_held_orders trg_set_hold_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_hold_number BEFORE INSERT ON public.pos_held_orders FOR EACH ROW EXECUTE FUNCTION public.set_hold_number();


--
-- Name: supplier_payment_allocations trg_supplier_payment_allocation_sync; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_supplier_payment_allocation_sync AFTER INSERT OR DELETE OR UPDATE ON public.supplier_payment_allocations FOR EACH ROW EXECUTE FUNCTION public.fn_sync_supplier_payment_allocation();


--
-- Name: ledger_entries trg_sync_account_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_account_balance AFTER INSERT OR DELETE OR UPDATE ON public.ledger_entries FOR EACH ROW EXECUTE FUNCTION public.fn_sync_account_balance();


--
-- Name: invoices trg_sync_customer_balance_on_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_customer_balance_on_invoice AFTER INSERT OR DELETE OR UPDATE OF "OutstandingBalance", "Status", "CustomerId" ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.sync_customer_balance_on_invoice_change();


--
-- Name: customer_payments trg_sync_customer_balance_on_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_customer_balance_on_payment AFTER INSERT OR DELETE OR UPDATE ON public.customer_payments FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_customer_balance();


--
-- Name: sales trg_sync_customer_balance_on_sale; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_customer_balance_on_sale AFTER INSERT OR DELETE OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_customer_balance();


--
-- Name: invoices trg_sync_customer_on_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_customer_on_invoice AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_sync_customer_on_invoice_change();


--
-- Name: customers trg_sync_customer_to_ar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_customer_to_ar AFTER INSERT OR DELETE OR UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.sync_customer_to_ar();


--
-- Name: goods_receipt_items trg_sync_gr_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_gr_totals AFTER INSERT OR DELETE OR UPDATE ON public.goods_receipt_items FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_gr_totals();


--
-- Name: invoices trg_sync_invoice_ar_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_invoice_ar_balance AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.fn_sync_invoice_ar_balance();


--
-- Name: invoice_payments trg_sync_invoice_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_invoice_balance AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_invoice_balance();


--
-- Name: invoices trg_sync_invoice_to_customer; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_invoice_to_customer AFTER INSERT OR DELETE OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.sync_invoice_to_customer();


--
-- Name: journal_entries trg_sync_ledger_from_journal; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_ledger_from_journal AFTER INSERT OR UPDATE ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.sync_ledger_from_journal();


--
-- Name: purchase_order_items trg_sync_po_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_po_totals AFTER INSERT OR DELETE OR UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_po_totals();


--
-- Name: inventory_batches trg_sync_product_stock_on_batch; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_product_stock_on_batch AFTER INSERT OR DELETE OR UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_product_stock();


--
-- Name: sale_items trg_sync_sale_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_sale_totals AFTER INSERT OR DELETE OR UPDATE ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_sale_totals();


--
-- Name: goods_receipt_items trg_sync_supplier_balance_on_gr; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_supplier_balance_on_gr AFTER INSERT OR DELETE OR UPDATE ON public.goods_receipt_items FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_balance_on_gr();


--
-- Name: goods_receipts trg_sync_supplier_balance_on_gr; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_supplier_balance_on_gr AFTER INSERT OR DELETE OR UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_supplier_balance();


--
-- Name: supplier_payments trg_sync_supplier_balance_on_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_supplier_balance_on_payment AFTER INSERT OR DELETE OR UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.fn_recalculate_supplier_balance();


--
-- Name: goods_receipts trg_sync_supplier_on_gr_complete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_supplier_on_gr_complete AFTER UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_on_gr_complete();


--
-- Name: supplier_invoices trg_sync_supplier_on_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_supplier_on_invoice AFTER INSERT OR DELETE OR UPDATE ON public.supplier_invoices FOR EACH ROW EXECUTE FUNCTION public.fn_sync_supplier_on_invoice_change();


--
-- Name: supplier_payments trg_sync_supplier_on_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_supplier_on_payment AFTER INSERT OR DELETE OR UPDATE ON public.supplier_payments FOR EACH ROW EXECUTE FUNCTION public.fn_sync_supplier_on_payment();


--
-- Name: delivery_orders trg_track_delivery_status_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_track_delivery_status_change AFTER UPDATE ON public.delivery_orders FOR EACH ROW EXECUTE FUNCTION public.track_delivery_status_change();


--
-- Name: pos_customer_deposits trg_update_deposit_status; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_deposit_status BEFORE UPDATE OF amount_used ON public.pos_customer_deposits FOR EACH ROW EXECUTE FUNCTION public.update_deposit_status_and_available();


--
-- Name: invoice_payments trg_update_invoice_after_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_invoice_after_payment AFTER INSERT OR DELETE OR UPDATE ON public.invoice_payments FOR EACH ROW EXECUTE FUNCTION public.update_invoice_totals_after_payment();


--
-- Name: quotations trg_update_quotation_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_quotation_timestamp BEFORE UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.update_quotation_timestamp();


--
-- Name: goods_receipts trg_validate_gr_finalization; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_gr_finalization BEFORE UPDATE ON public.goods_receipts FOR EACH ROW WHEN ((new.status = 'COMPLETED'::public.goods_receipt_status)) EXECUTE FUNCTION public.validate_gr_finalization();


--
-- Name: quotations trg_validate_quotation_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_quotation_totals BEFORE INSERT OR UPDATE ON public.quotations FOR EACH ROW EXECUTE FUNCTION public.fn_validate_quotation_totals();


--
-- Name: sales trg_validate_sale_payment; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_sale_payment BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.validate_sale_payment();


--
-- Name: sales trg_validate_sale_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_validate_sale_totals BEFORE INSERT OR UPDATE ON public.sales FOR EACH ROW EXECUTE FUNCTION public.fn_validate_sale_totals();


--
-- Name: cash_book_entries trigger_cashbook_entry_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cashbook_entry_number BEFORE INSERT ON public.cash_book_entries FOR EACH ROW EXECUTE FUNCTION public.trg_set_cashbook_entry_number();


--
-- Name: customers trigger_generate_customer_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_customer_number BEFORE INSERT ON public.customers FOR EACH ROW EXECUTE FUNCTION public.generate_customer_number();


--
-- Name: products trigger_generate_product_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_generate_product_number BEFORE INSERT ON public.products FOR EACH ROW EXECUTE FUNCTION public.generate_product_number();


--
-- Name: bank_reconciliations trigger_reconciliation_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_reconciliation_number BEFORE INSERT ON public.bank_reconciliations FOR EACH ROW EXECUTE FUNCTION public.trg_set_reconciliation_number();


--
-- Name: cash_bank_transfers trigger_transfer_number; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_transfer_number BEFORE INSERT ON public.cash_bank_transfers FOR EACH ROW EXECUTE FUNCTION public.trg_set_transfer_number();


--
-- Name: cash_book_entries trigger_update_cashbook_running_balance; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_cashbook_running_balance BEFORE INSERT ON public.cash_book_entries FOR EACH ROW EXECUTE FUNCTION public.trg_update_cashbook_running_balance();


--
-- Name: audit_log trigger_update_session_activity; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_session_activity AFTER INSERT ON public.audit_log FOR EACH ROW WHEN ((new.session_id IS NOT NULL)) EXECUTE FUNCTION public.update_session_activity();


--
-- Name: user_sessions trigger_update_session_duration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_session_duration BEFORE UPDATE ON public.user_sessions FOR EACH ROW EXECUTE FUNCTION public.update_session_duration();


--
-- Name: stock_count_lines trigger_update_stock_count_lines_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_stock_count_lines_updated_at BEFORE UPDATE ON public.stock_count_lines FOR EACH ROW EXECUTE FUNCTION public.update_stock_count_lines_updated_at();


--
-- Name: system_settings trigger_update_system_settings_timestamp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_system_settings_timestamp BEFORE UPDATE ON public.system_settings FOR EACH ROW EXECUTE FUNCTION public.update_system_settings_timestamp();


--
-- Name: cash_bank_transfers trigger_update_transfer_balances; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_transfer_balances AFTER UPDATE ON public.cash_bank_transfers FOR EACH ROW EXECUTE FUNCTION public.trg_update_transfer_balances();


--
-- Name: inventory_batches update_batches_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_batches_updated_at BEFORE UPDATE ON public.inventory_batches FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: customer_groups update_customer_groups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_customer_groups_updated_at BEFORE UPDATE ON public.customer_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: discounts update_discounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_discounts_updated_at BEFORE UPDATE ON public.discounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: goods_receipts update_gr_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_gr_updated_at BEFORE UPDATE ON public.goods_receipts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: purchase_orders update_po_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_po_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pricing_tiers update_pricing_tiers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_pricing_tiers_updated_at BEFORE UPDATE ON public.pricing_tiers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: products update_products_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: users update_users_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: accounts FK_accounts_accounts_ParentAccountId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT "FK_accounts_accounts_ParentAccountId" FOREIGN KEY ("ParentAccountId") REFERENCES public.accounts("Id") ON DELETE RESTRICT;


--
-- Name: credit_applications FK_credit_applications_customer_credits_CreditId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_applications
    ADD CONSTRAINT "FK_credit_applications_customer_credits_CreditId" FOREIGN KEY ("CreditId") REFERENCES public.customer_credits("Id") ON DELETE CASCADE;


--
-- Name: credit_applications FK_credit_applications_customer_credits_CustomerCreditId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_applications
    ADD CONSTRAINT "FK_credit_applications_customer_credits_CustomerCreditId" FOREIGN KEY ("CustomerCreditId") REFERENCES public.customer_credits("Id") ON DELETE CASCADE;


--
-- Name: credit_applications FK_credit_applications_ledger_transactions_LedgerTransactionId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_applications
    ADD CONSTRAINT "FK_credit_applications_ledger_transactions_LedgerTransactionId" FOREIGN KEY ("LedgerTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: customer_credits FK_customer_credits_customer_accounts_CustomerAccountId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT "FK_customer_credits_customer_accounts_CustomerAccountId" FOREIGN KEY ("CustomerAccountId") REFERENCES public.customer_accounts("Id") ON DELETE CASCADE;


--
-- Name: customer_credits FK_customer_credits_customer_accounts_CustomerAccountId1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT "FK_customer_credits_customer_accounts_CustomerAccountId1" FOREIGN KEY ("CustomerAccountId1") REFERENCES public.customer_accounts("Id");


--
-- Name: customer_credits FK_customer_credits_ledger_transactions_LedgerTransactionId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_credits
    ADD CONSTRAINT "FK_customer_credits_ledger_transactions_LedgerTransactionId" FOREIGN KEY ("LedgerTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: customer_deposits FK_customer_deposits_customer_accounts_CustomerAccountId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT "FK_customer_deposits_customer_accounts_CustomerAccountId" FOREIGN KEY ("CustomerAccountId") REFERENCES public.customer_accounts("Id") ON DELETE CASCADE;


--
-- Name: customer_deposits FK_customer_deposits_customer_accounts_CustomerAccountId1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT "FK_customer_deposits_customer_accounts_CustomerAccountId1" FOREIGN KEY ("CustomerAccountId1") REFERENCES public.customer_accounts("Id");


--
-- Name: customer_deposits FK_customer_deposits_ledger_transactions_LedgerTransactionId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_deposits
    ADD CONSTRAINT "FK_customer_deposits_ledger_transactions_LedgerTransactionId" FOREIGN KEY ("LedgerTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: deposit_applications FK_deposit_applications_customer_deposits_CustomerDepositId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_applications
    ADD CONSTRAINT "FK_deposit_applications_customer_deposits_CustomerDepositId" FOREIGN KEY ("CustomerDepositId") REFERENCES public.customer_deposits("Id") ON DELETE CASCADE;


--
-- Name: deposit_applications FK_deposit_applications_customer_deposits_DepositId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_applications
    ADD CONSTRAINT "FK_deposit_applications_customer_deposits_DepositId" FOREIGN KEY ("DepositId") REFERENCES public.customer_deposits("Id") ON DELETE CASCADE;


--
-- Name: deposit_applications FK_deposit_applications_ledger_transactions_LedgerTransactionId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deposit_applications
    ADD CONSTRAINT "FK_deposit_applications_ledger_transactions_LedgerTransactionId" FOREIGN KEY ("LedgerTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: invoice_line_items FK_invoice_line_items_invoices_InvoiceId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_line_items
    ADD CONSTRAINT "FK_invoice_line_items_invoices_InvoiceId" FOREIGN KEY ("InvoiceId") REFERENCES public.invoices("Id") ON DELETE CASCADE;


--
-- Name: journal_entries FK_journal_entries_journal_entries_VoidedByEntryId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entries
    ADD CONSTRAINT "FK_journal_entries_journal_entries_VoidedByEntryId" FOREIGN KEY ("VoidedByEntryId") REFERENCES public.journal_entries("Id") ON DELETE RESTRICT;


--
-- Name: journal_entry_lines FK_journal_entry_lines_accounts_AccountId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT "FK_journal_entry_lines_accounts_AccountId" FOREIGN KEY ("AccountId") REFERENCES public.accounts("Id") ON DELETE RESTRICT;


--
-- Name: journal_entry_lines FK_journal_entry_lines_journal_entries_JournalEntryId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.journal_entry_lines
    ADD CONSTRAINT "FK_journal_entry_lines_journal_entries_JournalEntryId" FOREIGN KEY ("JournalEntryId") REFERENCES public.journal_entries("Id") ON DELETE CASCADE;


--
-- Name: ledger_entries FK_ledger_entries_accounts_AccountId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT "FK_ledger_entries_accounts_AccountId" FOREIGN KEY ("AccountId") REFERENCES public.accounts("Id") ON DELETE RESTRICT;


--
-- Name: ledger_entries FK_ledger_entries_journal_entry_lines_JournalEntryLineId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT "FK_ledger_entries_journal_entry_lines_JournalEntryLineId" FOREIGN KEY ("JournalEntryLineId") REFERENCES public.journal_entry_lines("Id") ON DELETE RESTRICT;


--
-- Name: ledger_entries FK_ledger_entries_ledger_transactions_LedgerTransactionId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT "FK_ledger_entries_ledger_transactions_LedgerTransactionId" FOREIGN KEY ("LedgerTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: ledger_entries FK_ledger_entries_ledger_transactions_TransactionId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_entries
    ADD CONSTRAINT "FK_ledger_entries_ledger_transactions_TransactionId" FOREIGN KEY ("TransactionId") REFERENCES public.ledger_transactions("Id") ON DELETE CASCADE;


--
-- Name: ledger_transactions FK_ledger_transactions_ledger_transactions_OriginalTransaction~; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT "FK_ledger_transactions_ledger_transactions_OriginalTransaction~" FOREIGN KEY ("OriginalTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: ledger_transactions FK_ledger_transactions_ledger_transactions_ReversedByTransacti~; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT "FK_ledger_transactions_ledger_transactions_ReversedByTransacti~" FOREIGN KEY ("ReversedByTransactionId") REFERENCES public.ledger_transactions("Id") ON DELETE RESTRICT;


--
-- Name: payment_allocations FK_payment_allocations_customer_payments_PaymentId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT "FK_payment_allocations_customer_payments_PaymentId" FOREIGN KEY ("PaymentId") REFERENCES public.customer_payments("Id") ON DELETE CASCADE;


--
-- Name: payment_allocations FK_payment_allocations_invoices_InvoiceId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_allocations
    ADD CONSTRAINT "FK_payment_allocations_invoices_InvoiceId" FOREIGN KEY ("InvoiceId") REFERENCES public.invoices("Id") ON DELETE RESTRICT;


--
-- Name: supplier_invoice_line_items FK_supplier_invoice_line_items_supplier_invoices_SupplierInvoi~; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoice_line_items
    ADD CONSTRAINT "FK_supplier_invoice_line_items_supplier_invoices_SupplierInvoi~" FOREIGN KEY ("SupplierInvoiceId") REFERENCES public.supplier_invoices("Id") ON DELETE CASCADE;


--
-- Name: supplier_invoices FK_supplier_invoices_suppliers_SupplierId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_invoices
    ADD CONSTRAINT "FK_supplier_invoices_suppliers_SupplierId" FOREIGN KEY ("SupplierId") REFERENCES public.suppliers("Id") ON DELETE CASCADE;


--
-- Name: supplier_payment_allocations FK_supplier_payment_allocations_supplier_invoices_SupplierInvo~; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT "FK_supplier_payment_allocations_supplier_invoices_SupplierInvo~" FOREIGN KEY ("SupplierInvoiceId") REFERENCES public.supplier_invoices("Id") ON DELETE RESTRICT;


--
-- Name: supplier_payment_allocations FK_supplier_payment_allocations_supplier_payments_PaymentId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payment_allocations
    ADD CONSTRAINT "FK_supplier_payment_allocations_supplier_payments_PaymentId" FOREIGN KEY ("PaymentId") REFERENCES public.supplier_payments("Id") ON DELETE CASCADE;


--
-- Name: supplier_payments FK_supplier_payments_suppliers_SupplierId; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT "FK_supplier_payments_suppliers_SupplierId" FOREIGN KEY ("SupplierId") REFERENCES public.suppliers("Id") ON DELETE CASCADE;


--
-- Name: accounting_period_history accounting_period_history_period_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounting_period_history
    ADD CONSTRAINT accounting_period_history_period_id_fkey FOREIGN KEY (period_id) REFERENCES public.accounting_periods(id);


--
-- Name: audit_log audit_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: bank_accounts bank_accounts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: bank_accounts bank_accounts_gl_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_accounts
    ADD CONSTRAINT bank_accounts_gl_account_id_fkey FOREIGN KEY (gl_account_id) REFERENCES public.accounts("Id");


--
-- Name: bank_alerts bank_alerts_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_alerts
    ADD CONSTRAINT bank_alerts_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_alerts bank_alerts_statement_line_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_alerts
    ADD CONSTRAINT bank_alerts_statement_line_id_fkey FOREIGN KEY (statement_line_id) REFERENCES public.bank_statement_lines(id);


--
-- Name: bank_alerts bank_alerts_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_alerts
    ADD CONSTRAINT bank_alerts_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.bank_transactions(id);


--
-- Name: bank_categories bank_categories_default_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_categories
    ADD CONSTRAINT bank_categories_default_account_id_fkey FOREIGN KEY (default_account_id) REFERENCES public.accounts("Id");


--
-- Name: bank_patterns bank_patterns_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_patterns
    ADD CONSTRAINT bank_patterns_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_patterns bank_patterns_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_patterns
    ADD CONSTRAINT bank_patterns_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.bank_categories(id);


--
-- Name: bank_reconciliation_items bank_reconciliation_items_reconciliation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliation_items
    ADD CONSTRAINT bank_reconciliation_items_reconciliation_id_fkey FOREIGN KEY (reconciliation_id) REFERENCES public.bank_reconciliations(id) ON DELETE CASCADE;


--
-- Name: bank_reconciliations bank_reconciliations_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_reconciliations bank_reconciliations_reconciled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_reconciled_by_fkey FOREIGN KEY (reconciled_by) REFERENCES public.users(id);


--
-- Name: bank_reconciliations bank_reconciliations_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_reconciliations
    ADD CONSTRAINT bank_reconciliations_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: bank_recurring_rules bank_recurring_rules_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recurring_rules
    ADD CONSTRAINT bank_recurring_rules_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_recurring_rules bank_recurring_rules_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recurring_rules
    ADD CONSTRAINT bank_recurring_rules_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.bank_categories(id);


--
-- Name: bank_recurring_rules bank_recurring_rules_contra_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_recurring_rules
    ADD CONSTRAINT bank_recurring_rules_contra_account_id_fkey FOREIGN KEY (contra_account_id) REFERENCES public.accounts("Id");


--
-- Name: bank_statement_lines bank_statement_lines_matched_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_matched_transaction_id_fkey FOREIGN KEY (matched_transaction_id) REFERENCES public.bank_transactions(id);


--
-- Name: bank_statement_lines bank_statement_lines_statement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_statement_id_fkey FOREIGN KEY (statement_id) REFERENCES public.bank_statements(id) ON DELETE CASCADE;


--
-- Name: bank_statement_lines bank_statement_lines_suggested_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_suggested_account_id_fkey FOREIGN KEY (suggested_account_id) REFERENCES public.accounts("Id");


--
-- Name: bank_statement_lines bank_statement_lines_suggested_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statement_lines
    ADD CONSTRAINT bank_statement_lines_suggested_category_id_fkey FOREIGN KEY (suggested_category_id) REFERENCES public.bank_categories(id);


--
-- Name: bank_statements bank_statements_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_statements bank_statements_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_statements
    ADD CONSTRAINT bank_statements_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.bank_templates(id);


--
-- Name: bank_transaction_patterns bank_transaction_patterns_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transaction_patterns
    ADD CONSTRAINT bank_transaction_patterns_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.bank_categories(id);


--
-- Name: bank_transaction_patterns bank_transaction_patterns_contra_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transaction_patterns
    ADD CONSTRAINT bank_transaction_patterns_contra_account_id_fkey FOREIGN KEY (contra_account_id) REFERENCES public.accounts("Id");


--
-- Name: bank_transactions bank_transactions_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: bank_transactions bank_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.bank_categories(id);


--
-- Name: bank_transactions bank_transactions_contra_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_contra_account_id_fkey FOREIGN KEY (contra_account_id) REFERENCES public.accounts("Id");


--
-- Name: bank_transactions bank_transactions_gl_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_gl_transaction_id_fkey FOREIGN KEY (gl_transaction_id) REFERENCES public.ledger_transactions("Id");


--
-- Name: bank_transactions bank_transactions_reversal_transaction_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_reversal_transaction_id_fkey FOREIGN KEY (reversal_transaction_id) REFERENCES public.bank_transactions(id);


--
-- Name: bank_transactions bank_transactions_transfer_pair_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_transactions
    ADD CONSTRAINT bank_transactions_transfer_pair_id_fkey FOREIGN KEY (transfer_pair_id) REFERENCES public.bank_transactions(id);


--
-- Name: cash_bank_transfers cash_bank_transfers_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_bank_transfers
    ADD CONSTRAINT cash_bank_transfers_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: cash_bank_transfers cash_bank_transfers_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_bank_transfers
    ADD CONSTRAINT cash_bank_transfers_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: cash_bank_transfers cash_bank_transfers_from_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_bank_transfers
    ADD CONSTRAINT cash_bank_transfers_from_account_id_fkey FOREIGN KEY (from_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: cash_bank_transfers cash_bank_transfers_to_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_bank_transfers
    ADD CONSTRAINT cash_bank_transfers_to_account_id_fkey FOREIGN KEY (to_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: cash_book_entries cash_book_entries_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_book_entries
    ADD CONSTRAINT cash_book_entries_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.bank_accounts(id);


--
-- Name: cash_book_entries cash_book_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_book_entries
    ADD CONSTRAINT cash_book_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: cash_movements cash_movements_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: cash_movements cash_movements_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.cash_register_sessions(id);


--
-- Name: cash_movements cash_movements_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_movements
    ADD CONSTRAINT cash_movements_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: cash_register_sessions cash_register_sessions_reconciled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_reconciled_by_fkey FOREIGN KEY (reconciled_by) REFERENCES public.users(id);


--
-- Name: cash_register_sessions cash_register_sessions_register_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_register_id_fkey FOREIGN KEY (register_id) REFERENCES public.cash_registers(id);


--
-- Name: cash_register_sessions cash_register_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: cash_register_sessions cash_register_sessions_variance_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cash_register_sessions
    ADD CONSTRAINT cash_register_sessions_variance_approved_by_fkey FOREIGN KEY (variance_approved_by) REFERENCES public.users(id);


--
-- Name: cost_layers cost_layers_goods_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_layers
    ADD CONSTRAINT cost_layers_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id) ON DELETE SET NULL;


--
-- Name: cost_layers cost_layers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cost_layers
    ADD CONSTRAINT cost_layers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: customer_balance_adjustments customer_balance_adjustments_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_balance_adjustments
    ADD CONSTRAINT customer_balance_adjustments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: customer_balance_adjustments customer_balance_adjustments_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_balance_adjustments
    ADD CONSTRAINT customer_balance_adjustments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;


--
-- Name: customers customers_customer_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customers
    ADD CONSTRAINT customers_customer_group_id_fkey FOREIGN KEY (customer_group_id) REFERENCES public.customer_groups(id) ON DELETE SET NULL;


--
-- Name: delivery_items delivery_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE SET NULL;


--
-- Name: delivery_items delivery_items_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.delivery_orders(id) ON DELETE CASCADE;


--
-- Name: delivery_items delivery_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_items
    ADD CONSTRAINT delivery_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: delivery_orders delivery_orders_assigned_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_assigned_driver_id_fkey FOREIGN KEY (assigned_driver_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_orders delivery_orders_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_orders delivery_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: delivery_orders delivery_orders_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;


--
-- Name: delivery_orders delivery_orders_updated_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_orders
    ADD CONSTRAINT delivery_orders_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_proof delivery_proof_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.delivery_orders(id) ON DELETE CASCADE;


--
-- Name: delivery_proof delivery_proof_verified_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_proof
    ADD CONSTRAINT delivery_proof_verified_by_id_fkey FOREIGN KEY (verified_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_routes delivery_routes_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_routes
    ADD CONSTRAINT delivery_routes_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_routes delivery_routes_driver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_routes
    ADD CONSTRAINT delivery_routes_driver_id_fkey FOREIGN KEY (driver_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_status_history delivery_status_history_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_status_history
    ADD CONSTRAINT delivery_status_history_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: delivery_status_history delivery_status_history_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.delivery_status_history
    ADD CONSTRAINT delivery_status_history_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.delivery_orders(id) ON DELETE CASCADE;


--
-- Name: discount_authorizations discount_authorizations_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_authorizations
    ADD CONSTRAINT discount_authorizations_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: discount_authorizations discount_authorizations_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_authorizations
    ADD CONSTRAINT discount_authorizations_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE SET NULL;


--
-- Name: discount_authorizations discount_authorizations_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_authorizations
    ADD CONSTRAINT discount_authorizations_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES public.users(id);


--
-- Name: discount_authorizations discount_authorizations_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_authorizations
    ADD CONSTRAINT discount_authorizations_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: discount_rules discount_rules_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.discount_rules
    ADD CONSTRAINT discount_rules_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE CASCADE;


--
-- Name: expense_approvals expense_approvals_approver_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_approvals
    ADD CONSTRAINT expense_approvals_approver_id_fkey FOREIGN KEY (approver_id) REFERENCES public.users(id);


--
-- Name: expense_approvals expense_approvals_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_approvals
    ADD CONSTRAINT expense_approvals_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;


--
-- Name: expense_categories expense_categories_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_categories
    ADD CONSTRAINT expense_categories_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts("Id");


--
-- Name: expense_documents expense_documents_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_documents
    ADD CONSTRAINT expense_documents_expense_id_fkey FOREIGN KEY (expense_id) REFERENCES public.expenses(id) ON DELETE CASCADE;


--
-- Name: expense_documents expense_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expense_documents
    ADD CONSTRAINT expense_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: expenses expenses_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts("Id");


--
-- Name: expenses expenses_payment_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_payment_account_id_fkey FOREIGN KEY (payment_account_id) REFERENCES public.accounts("Id");


--
-- Name: failed_transactions failed_transactions_resolved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_transactions
    ADD CONSTRAINT failed_transactions_resolved_by_id_fkey FOREIGN KEY (resolved_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: failed_transactions failed_transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.failed_transactions
    ADD CONSTRAINT failed_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: financial_periods financial_periods_closed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_periods
    ADD CONSTRAINT financial_periods_closed_by_fkey FOREIGN KEY (closed_by) REFERENCES public.users(id);


--
-- Name: stock_count_lines fk_stock_count_lines_batch; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT fk_stock_count_lines_batch FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id) ON DELETE SET NULL;


--
-- Name: stock_count_lines fk_stock_count_lines_count; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT fk_stock_count_lines_count FOREIGN KEY (stock_count_id) REFERENCES public.stock_counts(id) ON DELETE CASCADE;


--
-- Name: stock_count_lines fk_stock_count_lines_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT fk_stock_count_lines_created_by FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: stock_count_lines fk_stock_count_lines_product; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT fk_stock_count_lines_product FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock_counts fk_stock_counts_created_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT fk_stock_counts_created_by FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: stock_counts fk_stock_counts_validated_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT fk_stock_counts_validated_by FOREIGN KEY (validated_by_id) REFERENCES public.users(id);


--
-- Name: goods_receipt_items goods_receipt_items_goods_receipt_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_goods_receipt_id_fkey FOREIGN KEY (goods_receipt_id) REFERENCES public.goods_receipts(id) ON DELETE CASCADE;


--
-- Name: goods_receipt_items goods_receipt_items_po_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_po_item_id_fkey FOREIGN KEY (po_item_id) REFERENCES public.purchase_order_items(id) ON DELETE SET NULL;


--
-- Name: goods_receipt_items goods_receipt_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: goods_receipt_items goods_receipt_items_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipt_items
    ADD CONSTRAINT goods_receipt_items_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.uoms(id) ON DELETE RESTRICT;


--
-- Name: goods_receipts goods_receipts_approved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_approved_by_id_fkey FOREIGN KEY (approved_by_id) REFERENCES public.users(id);


--
-- Name: goods_receipts goods_receipts_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id);


--
-- Name: goods_receipts goods_receipts_received_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.goods_receipts
    ADD CONSTRAINT goods_receipts_received_by_id_fkey FOREIGN KEY (received_by_id) REFERENCES public.users(id);


--
-- Name: inventory_batches inventory_batches_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_batches
    ADD CONSTRAINT inventory_batches_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: inventory_snapshots inventory_snapshots_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_snapshots
    ADD CONSTRAINT inventory_snapshots_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: inventory_snapshots inventory_snapshots_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.inventory_snapshots
    ADD CONSTRAINT inventory_snapshots_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: invoice_payments invoice_payments_processed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice_payments
    ADD CONSTRAINT invoice_payments_processed_by_id_fkey FOREIGN KEY (processed_by_id) REFERENCES public.users(id);


--
-- Name: ledger_transactions ledger_transactions_ReversesTransactionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ledger_transactions
    ADD CONSTRAINT "ledger_transactions_ReversesTransactionId_fkey" FOREIGN KEY ("ReversesTransactionId") REFERENCES public.ledger_transactions("Id");


--
-- Name: manual_journal_entries manual_journal_entries_reversed_by_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entries
    ADD CONSTRAINT manual_journal_entries_reversed_by_entry_id_fkey FOREIGN KEY (reversed_by_entry_id) REFERENCES public.manual_journal_entries(id);


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts("Id");


--
-- Name: manual_journal_entry_lines manual_journal_entry_lines_journal_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.manual_journal_entry_lines
    ADD CONSTRAINT manual_journal_entry_lines_journal_entry_id_fkey FOREIGN KEY (journal_entry_id) REFERENCES public.manual_journal_entries(id) ON DELETE CASCADE;


--
-- Name: payment_lines payment_lines_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_lines
    ADD CONSTRAINT payment_lines_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: payment_transactions payment_transactions_processed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_transactions
    ADD CONSTRAINT payment_transactions_processed_by_id_fkey FOREIGN KEY (processed_by_id) REFERENCES public.users(id);


--
-- Name: pos_customer_deposits pos_customer_deposits_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_customer_deposits
    ADD CONSTRAINT pos_customer_deposits_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: pos_customer_deposits pos_customer_deposits_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_customer_deposits
    ADD CONSTRAINT pos_customer_deposits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: pos_deposit_applications pos_deposit_applications_applied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_deposit_applications
    ADD CONSTRAINT pos_deposit_applications_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.users(id);


--
-- Name: pos_deposit_applications pos_deposit_applications_deposit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_deposit_applications
    ADD CONSTRAINT pos_deposit_applications_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.pos_customer_deposits(id);


--
-- Name: pos_deposit_applications pos_deposit_applications_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_deposit_applications
    ADD CONSTRAINT pos_deposit_applications_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id);


--
-- Name: pos_held_order_items pos_held_order_items_hold_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_order_items
    ADD CONSTRAINT pos_held_order_items_hold_id_fkey FOREIGN KEY (hold_id) REFERENCES public.pos_held_orders(id) ON DELETE CASCADE;


--
-- Name: pos_held_order_items pos_held_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_order_items
    ADD CONSTRAINT pos_held_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: pos_held_orders pos_held_orders_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_orders
    ADD CONSTRAINT pos_held_orders_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


--
-- Name: pos_held_orders pos_held_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pos_held_orders
    ADD CONSTRAINT pos_held_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pricing_tiers pricing_tiers_customer_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_customer_group_id_fkey FOREIGN KEY (customer_group_id) REFERENCES public.customer_groups(id) ON DELETE CASCADE;


--
-- Name: pricing_tiers pricing_tiers_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_uoms product_uoms_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_uoms
    ADD CONSTRAINT product_uoms_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;


--
-- Name: product_uoms product_uoms_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.product_uoms
    ADD CONSTRAINT product_uoms_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.uoms(id) ON DELETE RESTRICT;


--
-- Name: products products_base_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_base_uom_id_fkey FOREIGN KEY (base_uom_id) REFERENCES public.uoms(id);


--
-- Name: products products_income_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_income_account_id_fkey FOREIGN KEY (income_account_id) REFERENCES public.accounts("Id") ON DELETE SET NULL;


--
-- Name: purchase_order_items purchase_order_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: purchase_order_items purchase_order_items_purchase_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_purchase_order_id_fkey FOREIGN KEY (purchase_order_id) REFERENCES public.purchase_orders(id) ON DELETE CASCADE;


--
-- Name: purchase_order_items purchase_order_items_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_order_items
    ADD CONSTRAINT purchase_order_items_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.uoms(id) ON DELETE RESTRICT;


--
-- Name: purchase_orders purchase_orders_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: purchase_orders purchase_orders_sent_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.purchase_orders
    ADD CONSTRAINT purchase_orders_sent_by_id_fkey FOREIGN KEY (sent_by_id) REFERENCES public.users(id);


--
-- Name: quotation_attachments quotation_attachments_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_attachments
    ADD CONSTRAINT quotation_attachments_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotation_attachments quotation_attachments_uploaded_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_attachments
    ADD CONSTRAINT quotation_attachments_uploaded_by_id_fkey FOREIGN KEY (uploaded_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: quotation_emails quotation_emails_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_emails
    ADD CONSTRAINT quotation_emails_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotation_emails quotation_emails_sent_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_emails
    ADD CONSTRAINT quotation_emails_sent_by_id_fkey FOREIGN KEY (sent_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: quotation_items quotation_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;


--
-- Name: quotation_items quotation_items_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_items
    ADD CONSTRAINT quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotation_status_history quotation_status_history_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_status_history
    ADD CONSTRAINT quotation_status_history_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: quotation_status_history quotation_status_history_quotation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotation_status_history
    ADD CONSTRAINT quotation_status_history_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES public.quotations(id) ON DELETE CASCADE;


--
-- Name: quotations quotations_approved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_approved_by_id_fkey FOREIGN KEY (approved_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: quotations quotations_assigned_to_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_assigned_to_id_fkey FOREIGN KEY (assigned_to_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: quotations quotations_converted_to_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_converted_to_sale_id_fkey FOREIGN KEY (converted_to_sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;


--
-- Name: quotations quotations_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: quotations quotations_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT;


--
-- Name: quotations quotations_parent_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quotations
    ADD CONSTRAINT quotations_parent_quote_id_fkey FOREIGN KEY (parent_quote_id) REFERENCES public.quotations(id) ON DELETE SET NULL;


--
-- Name: rbac_role_permissions rbac_role_permissions_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_permissions
    ADD CONSTRAINT rbac_role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: rbac_user_roles rbac_user_roles_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_roles
    ADD CONSTRAINT rbac_user_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.rbac_roles(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: report_runs report_runs_generated_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.report_runs
    ADD CONSTRAINT report_runs_generated_by_id_fkey FOREIGN KEY (generated_by_id) REFERENCES public.users(id);


--
-- Name: route_deliveries route_deliveries_delivery_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_deliveries
    ADD CONSTRAINT route_deliveries_delivery_order_id_fkey FOREIGN KEY (delivery_order_id) REFERENCES public.delivery_orders(id) ON DELETE CASCADE;


--
-- Name: route_deliveries route_deliveries_route_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_deliveries
    ADD CONSTRAINT route_deliveries_route_id_fkey FOREIGN KEY (route_id) REFERENCES public.delivery_routes(id) ON DELETE CASCADE;


--
-- Name: sale_discounts sale_discounts_authorization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_discounts
    ADD CONSTRAINT sale_discounts_authorization_id_fkey FOREIGN KEY (authorization_id) REFERENCES public.discount_authorizations(id);


--
-- Name: sale_discounts sale_discounts_discount_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_discounts
    ADD CONSTRAINT sale_discounts_discount_id_fkey FOREIGN KEY (discount_id) REFERENCES public.discounts(id) ON DELETE SET NULL;


--
-- Name: sale_discounts sale_discounts_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_discounts
    ADD CONSTRAINT sale_discounts_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_discounts sale_discounts_sale_item_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_discounts
    ADD CONSTRAINT sale_discounts_sale_item_id_fkey FOREIGN KEY (sale_item_id) REFERENCES public.sale_items(id) ON DELETE CASCADE;


--
-- Name: sale_items sale_items_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: sale_items sale_items_income_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_income_account_id_fkey FOREIGN KEY (income_account_id) REFERENCES public.accounts("Id") ON DELETE SET NULL;


--
-- Name: sale_items sale_items_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: sale_items sale_items_sale_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


--
-- Name: sale_items sale_items_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sale_items
    ADD CONSTRAINT sale_items_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.uoms(id) ON DELETE RESTRICT;


--
-- Name: sales sales_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.users(id);


--
-- Name: sales sales_customer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.customers(id);


--
-- Name: sales sales_quote_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.quotations(id) ON DELETE SET NULL;


--
-- Name: sales sales_void_approved_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_void_approved_by_id_fkey FOREIGN KEY (void_approved_by_id) REFERENCES public.users(id);


--
-- Name: sales sales_voided_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_voided_by_id_fkey FOREIGN KEY (voided_by_id) REFERENCES public.users(id);


--
-- Name: stock_count_lines stock_count_lines_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT stock_count_lines_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: stock_count_lines stock_count_lines_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT stock_count_lines_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: stock_count_lines stock_count_lines_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT stock_count_lines_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock_count_lines stock_count_lines_stock_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_count_lines
    ADD CONSTRAINT stock_count_lines_stock_count_id_fkey FOREIGN KEY (stock_count_id) REFERENCES public.stock_counts(id) ON DELETE CASCADE;


--
-- Name: stock_counts stock_counts_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: stock_counts stock_counts_validated_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_counts
    ADD CONSTRAINT stock_counts_validated_by_id_fkey FOREIGN KEY (validated_by_id) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.inventory_batches(id);


--
-- Name: stock_movements stock_movements_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.users(id);


--
-- Name: stock_movements stock_movements_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: stock_movements stock_movements_stock_count_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_stock_count_id_fkey FOREIGN KEY (stock_count_id) REFERENCES public.stock_counts(id);


--
-- Name: stock_movements stock_movements_uom_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movements
    ADD CONSTRAINT stock_movements_uom_id_fkey FOREIGN KEY (uom_id) REFERENCES public.uoms(id) ON DELETE RESTRICT;


--
-- Name: system_backups system_backups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_backups
    ADD CONSTRAINT system_backups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: system_backups system_backups_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_backups
    ADD CONSTRAINT system_backups_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: system_backups system_backups_last_restored_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_backups
    ADD CONSTRAINT system_backups_last_restored_by_fkey FOREIGN KEY (last_restored_by) REFERENCES public.users(id);


--
-- Name: system_backups system_backups_verified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_backups
    ADD CONSTRAINT system_backups_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(id);


--
-- Name: system_maintenance_mode system_maintenance_mode_ended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_maintenance_mode
    ADD CONSTRAINT system_maintenance_mode_ended_by_fkey FOREIGN KEY (ended_by) REFERENCES public.users(id);


--
-- Name: system_maintenance_mode system_maintenance_mode_started_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_maintenance_mode
    ADD CONSTRAINT system_maintenance_mode_started_by_fkey FOREIGN KEY (started_by) REFERENCES public.users(id);


--
-- Name: system_reset_log system_reset_log_authorized_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_reset_log
    ADD CONSTRAINT system_reset_log_authorized_by_fkey FOREIGN KEY (authorized_by) REFERENCES public.users(id);


--
-- Name: system_reset_log system_reset_log_backup_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_reset_log
    ADD CONSTRAINT system_reset_log_backup_id_fkey FOREIGN KEY (backup_id) REFERENCES public.system_backups(id);


--
-- Name: system_settings system_settings_updated_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_settings
    ADD CONSTRAINT system_settings_updated_by_id_fkey FOREIGN KEY (updated_by_id) REFERENCES public.users(id);


--
-- Name: user_sessions user_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_sessions
    ADD CONSTRAINT user_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

