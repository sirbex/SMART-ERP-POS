-- Migration 065: Drop CAT 6 (Period enforcement), CAT 7 (Audit/logging), CAT 8 (Auto-populate) triggers
-- Period enforcement moved to periodGuard.ts utility called from services.
-- Audit/logging moved to auditRepository, deliveryRepository, quotationRepository, salesService, etc.
-- Auto-populate moved to inventoryRepository.createBatch, productRepository.createProduct.
-- Date: 2026-04-02

BEGIN;

-- =====================================================
-- CAT 6: PERIOD ENFORCEMENT (8 triggers)
-- =====================================================

DROP TRIGGER IF EXISTS trg_enforce_period_goods_receipts ON goods_receipts;
DROP TRIGGER IF EXISTS trg_enforce_period_invoice_payments ON invoice_payments;
DROP TRIGGER IF EXISTS trg_enforce_period_journal_entries ON journal_entries;
DROP TRIGGER IF EXISTS trg_enforce_period_ledger_entries ON ledger_entries;
DROP TRIGGER IF EXISTS tr_validate_period_open ON ledger_transactions;
DROP TRIGGER IF EXISTS trg_enforce_period_ledger_transactions ON ledger_transactions;
DROP TRIGGER IF EXISTS trg_manual_je_period_check ON manual_journal_entries;
DROP TRIGGER IF EXISTS trg_enforce_period_sales ON sales;


-- =====================================================
-- CAT 7: AUDIT/LOGGING (5 triggers)
-- =====================================================

-- Session activity tracking (moved to auditRepository.createAuditEntry)
DROP TRIGGER IF EXISTS trigger_update_session_activity ON audit_log;

-- Customer balance audit (moved to invoiceFromDN, creditDebitNoteService, salesService)
DROP TRIGGER IF EXISTS trg_audit_customer_balance ON customers;

-- Delivery status history (moved to deliveryRepository.updateDeliveryOrderStatus)
DROP TRIGGER IF EXISTS trg_track_delivery_status_change ON delivery_orders;

-- Stock movement logging (app already creates movements via skip guard)
DROP TRIGGER IF EXISTS trg_log_stock_movement ON inventory_batches;

-- Quotation status history (moved to quotationRepository.updateQuotationStatus)
DROP TRIGGER IF EXISTS trg_log_quote_status_change ON quotations;


-- =====================================================
-- CAT 8: AUTO-POPULATE (3 triggers)
-- =====================================================

-- GR item PO item auto-populate (app already sets po_item_id)
DROP TRIGGER IF EXISTS trg_auto_populate_gr_po_item_id ON goods_receipt_items;

-- Ghost batch prevention / source_type default (moved to inventoryRepository.createBatch)
DROP TRIGGER IF EXISTS trg_prevent_ghost_batches ON inventory_batches;

-- Product child row creation (moved to productRepository.createProduct)
DROP TRIGGER IF EXISTS trg_product_create_children ON products;


-- =====================================================
-- DROP ORPHANED FUNCTIONS (13 functions)
-- =====================================================

-- CAT 6 functions
DROP FUNCTION IF EXISTS fn_enforce_open_period() CASCADE;
DROP FUNCTION IF EXISTS validate_period_open() CASCADE;
DROP FUNCTION IF EXISTS fn_enforce_open_period_manual_je() CASCADE;

-- CAT 7 functions
DROP FUNCTION IF EXISTS update_session_activity() CASCADE;
DROP FUNCTION IF EXISTS audit_customer_balance_change() CASCADE;
DROP FUNCTION IF EXISTS track_delivery_status_change() CASCADE;
DROP FUNCTION IF EXISTS fn_log_stock_movement() CASCADE;
DROP FUNCTION IF EXISTS log_quotation_status_change() CASCADE;

-- CAT 8 functions
DROP FUNCTION IF EXISTS auto_populate_gr_po_item_id() CASCADE;
DROP FUNCTION IF EXISTS prevent_ghost_batches() CASCADE;
DROP FUNCTION IF EXISTS fn_product_create_children() CASCADE;

-- Also drop the movement number generator used only by the stock movement trigger
DROP FUNCTION IF EXISTS generate_movement_number() CASCADE;

COMMIT;
