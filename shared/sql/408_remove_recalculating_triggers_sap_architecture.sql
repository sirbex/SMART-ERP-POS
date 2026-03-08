-- Migration: 408_remove_recalculating_triggers_sap_architecture.sql
-- Date: 2026-03-06
-- Description: Remove all "recalculate from children" triggers (SAP architecture Phase 1)
--
-- ARCHITECTURE: Application-layer calculations, database-layer validation
--
-- These triggers OVERWRITE app-calculated values by recalculating from child rows.
-- This conflicts with the application service layer which is the SINGLE SOURCE OF TRUTH.
--
-- App-layer code that replaces each trigger:
--   PO totals:        purchaseOrderRepository.updatePOTotal() [already existed]
--   GR totals:        goodsReceiptRepository.finalizeGR() now calculates total_value
--   Product stock:    salesService.createSale() + voidSale() + goodsReceiptService.finalizeGR()
--                     + stockMovementHandler.updateProductQuantity() [already existed]
--   Customer balance: Invoice triggers (trg_sync_customer_on_invoice) remain authoritative
--   Supplier balance: Invoice triggers (trg_sync_supplier_on_invoice) remain authoritative
--
-- KEPT (authoritative invoice-based triggers):
--   trg_sync_customer_on_invoice      → fn_sync_customer_on_invoice_change (recalcs from invoices)
--   trg_sync_customer_balance_on_invoice → fn_recalculate_customer_ar_balance (recalcs from invoices)
--   trg_sync_supplier_on_invoice      → fn_sync_supplier_on_invoice_change (recalcs from supplier invoices)
--   trg_supplier_payment_allocation_sync → fn_sync_supplier_payment_allocation
--   trg_sync_invoice_balance          → fn_recalculate_invoice_balance (from invoice_payments)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. DROP PO TOTALS TRIGGER
-- App: purchaseOrderRepository.updatePOTotal() already calculates from items
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_po_totals ON purchase_order_items;

COMMENT ON FUNCTION fn_recalculate_po_totals() IS
  'DEPRECATED: App layer (purchaseOrderRepository.updatePOTotal) is single source of truth. '
  'Trigger trg_sync_po_totals removed in migration 408.';

-- ============================================================================
-- 2. DROP GR TOTALS TRIGGER
-- App: goodsReceiptRepository.finalizeGR() now calculates total_value in UPDATE
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_gr_totals ON goods_receipt_items;

COMMENT ON FUNCTION fn_recalculate_gr_totals() IS
  'DEPRECATED: App layer (goodsReceiptRepository.finalizeGR) is single source of truth. '
  'Trigger trg_sync_gr_totals removed in migration 408.';

-- ============================================================================
-- 3. DROP PRODUCT STOCK TRIGGER
-- App: salesService, goodsReceiptService, stockMovementHandler all update
--      products.quantity_on_hand after batch modifications
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_product_stock_on_batch ON inventory_batches;

COMMENT ON FUNCTION fn_recalculate_product_stock() IS
  'DEPRECATED: App layer updates products.quantity_on_hand directly after batch changes. '
  'Trigger trg_sync_product_stock_on_batch removed in migration 408.';

-- ============================================================================
-- 4. DROP CUSTOMER BALANCE TRIGGERS (on sales and customer_payments)
-- These conflict with the authoritative invoice-based triggers:
--   trg_sync_customer_on_invoice → fn_recalculate_customer_ar_balance
-- The invoice trigger recalculates balance = SUM(outstanding invoices), which is correct.
-- The sale/payment triggers used a different formula and could overwrite.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_customer_balance_on_sale ON sales;
DROP TRIGGER IF EXISTS trg_sync_customer_balance_on_payment ON customer_payments;

COMMENT ON FUNCTION fn_recalculate_customer_balance() IS
  'DEPRECATED: Customer balance is derived from invoices (fn_recalculate_customer_ar_balance). '
  'Triggers trg_sync_customer_balance_on_sale/payment removed in migration 408.';

-- ============================================================================
-- 5. DROP SUPPLIER BALANCE TRIGGERS (on goods_receipts and goods_receipt_items)
-- These conflict with the authoritative invoice-based triggers:
--   trg_sync_supplier_on_invoice → fn_recalculate_supplier_ap_balance
-- The invoice trigger recalculates from supplier_invoices, which is correct.
-- The GR/payment triggers used a different formula (raw GR totals) and could overwrite.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_on_gr ON goods_receipts;
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_on_gr ON goods_receipt_items;
DROP TRIGGER IF EXISTS trg_sync_supplier_balance_on_payment ON supplier_payments;

COMMENT ON FUNCTION fn_recalculate_supplier_balance() IS
  'DEPRECATED: Supplier balance is derived from supplier_invoices (fn_recalculate_supplier_ap_balance). '
  'Triggers trg_sync_supplier_balance_on_gr/payment removed in migration 408.';

-- ============================================================================
-- 6. ADD VALIDATION GUARD: PO TOTALS
-- BEFORE trigger that validates (never modifies) — SAP pattern
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_po_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_expected_total NUMERIC;
    v_actual_total NUMERIC;
    v_tolerance NUMERIC := 0.01;
BEGIN
    -- Only validate on INSERT or when total_amount changes
    IF TG_OP = 'UPDATE' AND NEW.total_amount IS NOT DISTINCT FROM OLD.total_amount THEN
        RETURN NEW;
    END IF;

    -- Skip validation for DRAFT POs (items may not be finalized yet)
    IF NEW.status = 'DRAFT' THEN
        RETURN NEW;
    END IF;

    -- Calculate expected total from items
    SELECT COALESCE(SUM(total_price), 0)
    INTO v_expected_total
    FROM purchase_order_items
    WHERE purchase_order_id = NEW.id;

    v_actual_total := COALESCE(NEW.total_amount, 0);

    -- Allow if no items yet (new PO being created)
    IF v_expected_total = 0 AND v_actual_total = 0 THEN
        RETURN NEW;
    END IF;

    IF ABS(v_expected_total - v_actual_total) > v_tolerance THEN
        RAISE EXCEPTION 'PO total validation failed: expected %.2f but got %.2f',
            v_expected_total, v_actual_total;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_po_totals ON purchase_orders;
CREATE TRIGGER trg_validate_po_totals
    BEFORE INSERT OR UPDATE ON purchase_orders
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_po_totals();

-- ============================================================================
-- 7. ADD VALIDATION GUARD: GR TOTALS
-- BEFORE trigger that validates (never modifies) — SAP pattern
-- ============================================================================
CREATE OR REPLACE FUNCTION fn_validate_gr_totals()
RETURNS TRIGGER AS $$
DECLARE
    v_expected_total NUMERIC;
    v_actual_total NUMERIC;
    v_tolerance NUMERIC := 0.01;
BEGIN
    -- Only validate on UPDATE when total_value changes and status is COMPLETED
    IF TG_OP = 'INSERT' THEN
        RETURN NEW;
    END IF;

    IF NEW.status != 'COMPLETED' THEN
        RETURN NEW;
    END IF;

    IF NEW.total_value IS NOT DISTINCT FROM OLD.total_value THEN
        RETURN NEW;
    END IF;

    -- Calculate expected total from items
    SELECT COALESCE(SUM(received_quantity * cost_price), 0)
    INTO v_expected_total
    FROM goods_receipt_items
    WHERE goods_receipt_id = NEW.id;

    v_actual_total := COALESCE(NEW.total_value, 0);

    IF ABS(v_expected_total - v_actual_total) > v_tolerance THEN
        RAISE EXCEPTION 'GR total validation failed: expected %.2f but got %.2f',
            v_expected_total, v_actual_total;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_gr_totals ON goods_receipts;
CREATE TRIGGER trg_validate_gr_totals
    BEFORE INSERT OR UPDATE ON goods_receipts
    FOR EACH ROW
    EXECUTE FUNCTION fn_validate_gr_totals();

COMMIT;
