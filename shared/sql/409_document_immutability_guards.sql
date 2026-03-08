-- ============================================================================
-- Migration 409: Document Immutability Guards (SAP Phase 2)
-- ============================================================================
-- Purpose: Enforce document immutability at the database level.
--          Once a financial document reaches a terminal/final state,
--          its core data cannot be modified. Corrections must go through
--          void/reversal patterns.
--
-- Architecture: DB-level safety net for app-layer immutability checks.
--   - App layer is the FIRST line of defense (service checks)
--   - DB triggers are the LAST line of defense (catch direct SQL / bugs)
--
-- Already protected:
--   - ledger_transactions: tr_prevent_posted_modification (POSTED/REVERSED)
--   - quotations: tr_protect_converted_quotation (CONVERTED)
--
-- This migration adds 9 new triggers across 9 tables.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. SALES — COMPLETED can only transition to VOID; VOID/REFUNDED are locked
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_protect_completed_sale()
RETURNS TRIGGER AS $$
BEGIN
    -- VOID and REFUNDED sales are fully immutable
    IF OLD.status IN ('VOID', 'REFUNDED') THEN
        RAISE EXCEPTION 'Cannot modify % sale %. Use a new transaction instead.',
            OLD.status, OLD.sale_number;
    END IF;

    -- COMPLETED sales: only allow status transition to VOID or REFUNDED
    IF OLD.status = 'COMPLETED' THEN
        -- Allow the status change itself (+ associated void tracking columns)
        IF NEW.status IN ('VOID', 'REFUNDED') THEN
            RETURN NEW;
        END IF;

        -- Block any other modification
        RAISE EXCEPTION 'Cannot modify COMPLETED sale %. Void the sale instead.',
            OLD.sale_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_completed_sale ON sales;
CREATE TRIGGER trg_protect_completed_sale
    BEFORE UPDATE ON sales
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_completed_sale();

COMMENT ON TRIGGER trg_protect_completed_sale ON sales IS
    'SAP Phase 2: Prevents modification of COMPLETED/VOID/REFUNDED sales. Corrections must use void/reversal.';

-- ============================================================================
-- 2. PURCHASE ORDERS — COMPLETED and CANCELLED are locked
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_protect_completed_po()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IN ('COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Cannot modify % purchase order %. Create a new PO instead.',
            OLD.status, OLD.order_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_completed_po ON purchase_orders;
CREATE TRIGGER trg_protect_completed_po
    BEFORE UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_completed_po();

COMMENT ON TRIGGER trg_protect_completed_po ON purchase_orders IS
    'SAP Phase 2: Prevents modification of COMPLETED/CANCELLED purchase orders.';

-- ============================================================================
-- 3. GOODS RECEIPTS — COMPLETED are locked
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_protect_completed_gr()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'COMPLETED' THEN
        RAISE EXCEPTION 'Cannot modify COMPLETED goods receipt %. Create a new GR for corrections.',
            OLD.receipt_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_completed_gr ON goods_receipts;
CREATE TRIGGER trg_protect_completed_gr
    BEFORE UPDATE ON goods_receipts
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_completed_gr();

COMMENT ON TRIGGER trg_protect_completed_gr ON goods_receipts IS
    'SAP Phase 2: Prevents modification of COMPLETED goods receipts.';

-- ============================================================================
-- 4. INVOICES — Paid: lock financial columns; Cancelled: fully locked
-- ============================================================================
-- Note: Invoices use PascalCase columns. Paid invoices must still allow
-- payment-tracking updates (AmountPaid, OutstandingBalance, Status)
-- because the invoice_payments system updates these.

CREATE OR REPLACE FUNCTION fn_protect_paid_invoice()
RETURNS TRIGGER AS $$
BEGIN
    -- Cancelled invoices are fully immutable
    IF OLD."Status" = 'Cancelled' THEN
        RAISE EXCEPTION 'Cannot modify cancelled invoice %.', OLD."InvoiceNumber";
    END IF;

    -- Paid invoices: lock financial fields, allow payment tracking updates
    IF OLD."Status" = 'Paid' THEN
        -- Allow payment-related column updates (for refunds/reversals)
        IF NEW."AmountPaid" IS DISTINCT FROM OLD."AmountPaid"
           OR NEW."OutstandingBalance" IS DISTINCT FROM OLD."OutstandingBalance"
           OR NEW."Status" IS DISTINCT FROM OLD."Status" THEN
            RETURN NEW;
        END IF;

        -- Block changes to core financial fields
        IF NEW."Subtotal" IS DISTINCT FROM OLD."Subtotal"
           OR NEW."TaxAmount" IS DISTINCT FROM OLD."TaxAmount"
           OR NEW."TotalAmount" IS DISTINCT FROM OLD."TotalAmount"
           OR NEW."CustomerId" IS DISTINCT FROM OLD."CustomerId"
           OR NEW."InvoiceDate" IS DISTINCT FROM OLD."InvoiceDate"
           OR NEW."DueDate" IS DISTINCT FROM OLD."DueDate" THEN
            RAISE EXCEPTION 'Cannot modify financial details of paid invoice %. Use a credit note instead.',
                OLD."InvoiceNumber";
        END IF;

        -- Allow non-financial updates (Notes, Reference, UpdatedAt)
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_paid_invoice ON invoices;
CREATE TRIGGER trg_protect_paid_invoice
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_paid_invoice();

COMMENT ON TRIGGER trg_protect_paid_invoice ON invoices IS
    'SAP Phase 2: Prevents modification of Paid invoice financials. Payment tracking updates allowed.';

-- ============================================================================
-- 5. SUPPLIER INVOICES — Same pattern as customer invoices
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_protect_paid_supplier_invoice()
RETURNS TRIGGER AS $$
BEGIN
    -- Cancelled supplier invoices are fully immutable
    IF OLD."Status" = 'Cancelled' THEN
        RAISE EXCEPTION 'Cannot modify cancelled supplier invoice %.', OLD."SupplierInvoiceNumber";
    END IF;

    -- Paid supplier invoices: lock financial fields
    IF OLD."Status" = 'Paid' THEN
        IF NEW."AmountPaid" IS DISTINCT FROM OLD."AmountPaid"
           OR NEW."OutstandingBalance" IS DISTINCT FROM OLD."OutstandingBalance"
           OR NEW."Status" IS DISTINCT FROM OLD."Status" THEN
            RETURN NEW;
        END IF;

        IF NEW."Subtotal" IS DISTINCT FROM OLD."Subtotal"
           OR NEW."TaxAmount" IS DISTINCT FROM OLD."TaxAmount"
           OR NEW."TotalAmount" IS DISTINCT FROM OLD."TotalAmount"
           OR NEW."SupplierId" IS DISTINCT FROM OLD."SupplierId"
           OR NEW."InvoiceDate" IS DISTINCT FROM OLD."InvoiceDate"
           OR NEW."DueDate" IS DISTINCT FROM OLD."DueDate" THEN
            RAISE EXCEPTION 'Cannot modify financial details of paid supplier invoice %. Use a debit note instead.',
                OLD."SupplierInvoiceNumber";
        END IF;

        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_paid_supplier_invoice ON supplier_invoices;
CREATE TRIGGER trg_protect_paid_supplier_invoice
    BEFORE UPDATE ON supplier_invoices
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_paid_supplier_invoice();

COMMENT ON TRIGGER trg_protect_paid_supplier_invoice ON supplier_invoices IS
    'SAP Phase 2: Prevents modification of Paid supplier invoice financials.';

-- ============================================================================
-- 6. SUPPLIER PAYMENTS — COMPLETED are locked
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_protect_completed_supplier_payment()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD."Status" = 'COMPLETED' THEN
        -- Allow allocation updates (AllocatedAmount, UnallocatedAmount) for payment allocation workflow
        IF NEW."AllocatedAmount" IS DISTINCT FROM OLD."AllocatedAmount"
           OR NEW."UnallocatedAmount" IS DISTINCT FROM OLD."UnallocatedAmount" THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Cannot modify COMPLETED supplier payment %. Record a new payment instead.',
            OLD."PaymentNumber";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_completed_supplier_payment ON supplier_payments;
CREATE TRIGGER trg_protect_completed_supplier_payment
    BEFORE UPDATE ON supplier_payments
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_completed_supplier_payment();

COMMENT ON TRIGGER trg_protect_completed_supplier_payment ON supplier_payments IS
    'SAP Phase 2: Prevents modification of COMPLETED supplier payments. Allocation updates allowed.';

-- ============================================================================
-- 7. EXPENSES — PAID are locked
-- ============================================================================

CREATE OR REPLACE FUNCTION fn_protect_paid_expense()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'PAID' THEN
        RAISE EXCEPTION 'Cannot modify PAID expense. Record an adjustment instead.';
    END IF;

    -- APPROVED can only transition to PAID or CANCELLED
    IF OLD.status = 'APPROVED' THEN
        IF NEW.status NOT IN ('APPROVED', 'PAID', 'CANCELLED') THEN
            RAISE EXCEPTION 'APPROVED expense can only transition to PAID or CANCELLED, not %.', NEW.status;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_paid_expense ON expenses;
CREATE TRIGGER trg_protect_paid_expense
    BEFORE UPDATE ON expenses
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_paid_expense();

COMMENT ON TRIGGER trg_protect_paid_expense ON expenses IS
    'SAP Phase 2: Prevents modification of PAID expenses. APPROVED can only go to PAID/CANCELLED.';

-- ============================================================================
-- 8. STOCK MOVEMENTS — Append-only (no UPDATE or DELETE)
-- ============================================================================
-- Stock movements are audit records. Once created, they must never be modified
-- or deleted. Corrections are done by creating a new reversing movement.

CREATE OR REPLACE FUNCTION fn_protect_stock_movements()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Cannot delete stock movement %. Stock movements are immutable audit records. Create a reversing movement instead.',
            OLD.movement_number;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'Cannot modify stock movement %. Stock movements are immutable audit records. Create a reversing movement instead.',
            OLD.movement_number;
    END IF;

    RETURN NULL; -- Should never reach here
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_stock_movements ON stock_movements;
CREATE TRIGGER trg_protect_stock_movements
    BEFORE UPDATE OR DELETE ON stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_stock_movements();

COMMENT ON TRIGGER trg_protect_stock_movements ON stock_movements IS
    'SAP Phase 2: Stock movements are append-only audit records. No UPDATE or DELETE allowed.';

-- ============================================================================
-- 9. BANK TRANSACTIONS — Reconciled transactions are locked
-- ============================================================================
-- Once a bank transaction is reconciled (matched to a GL entry), it must not
-- be modified. Only reversal flags can be set.

CREATE OR REPLACE FUNCTION fn_protect_reconciled_bank_transaction()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.is_reconciled = true THEN
        -- Allow setting reversal flags on reconciled transactions
        IF NEW.is_reversed IS DISTINCT FROM OLD.is_reversed
           OR NEW.reversed_at IS DISTINCT FROM OLD.reversed_at
           OR NEW.reversed_by IS DISTINCT FROM OLD.reversed_by
           OR NEW.reversal_reason IS DISTINCT FROM OLD.reversal_reason
           OR NEW.reversal_transaction_id IS DISTINCT FROM OLD.reversal_transaction_id THEN
            RETURN NEW;
        END IF;

        RAISE EXCEPTION 'Cannot modify reconciled bank transaction %. Reverse it instead.',
            OLD.transaction_number;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_reconciled_bank_txn ON bank_transactions;
CREATE TRIGGER trg_protect_reconciled_bank_txn
    BEFORE UPDATE ON bank_transactions
    FOR EACH ROW
    EXECUTE FUNCTION fn_protect_reconciled_bank_transaction();

COMMENT ON TRIGGER trg_protect_reconciled_bank_txn ON bank_transactions IS
    'SAP Phase 2: Reconciled bank transactions cannot be modified. Only reversal flags allowed.';

-- ============================================================================
-- VERIFICATION
-- ============================================================================
DO $$
DECLARE
    trigger_count INTEGER;
BEGIN
    SELECT count(*) INTO trigger_count
    FROM pg_trigger t
    JOIN pg_class c ON t.tgrelid = c.oid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE n.nspname = 'public'
    AND t.tgname LIKE 'trg_protect_%';

    RAISE NOTICE '✅ Migration 409 complete: % protection triggers active', trigger_count;
    RAISE NOTICE '  Documents now protected:';
    RAISE NOTICE '  - sales (COMPLETED/VOID/REFUNDED)';
    RAISE NOTICE '  - purchase_orders (COMPLETED/CANCELLED)';
    RAISE NOTICE '  - goods_receipts (COMPLETED)';
    RAISE NOTICE '  - invoices (Paid/Cancelled)';
    RAISE NOTICE '  - supplier_invoices (Paid/Cancelled)';
    RAISE NOTICE '  - supplier_payments (COMPLETED)';
    RAISE NOTICE '  - expenses (PAID/APPROVED)';
    RAISE NOTICE '  - stock_movements (append-only)';
    RAISE NOTICE '  - bank_transactions (reconciled)';
END $$;

COMMIT;
