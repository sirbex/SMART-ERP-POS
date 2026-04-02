-- Migration 061: Drop all DISABLED triggers + duplicate updated_at triggers
--
-- ARCHITECTURE RULE: Database is passive storage only.
-- ALL business logic must exist in the Service layer.
-- Triggers violate this rule — they are hidden DB-side side effects.
--
-- Phase 1: Drop 23 disabled triggers (already doing nothing) 
--          + 2 duplicate updated_at triggers on customer_groups and pricing_tiers
--          + orphaned trigger functions
--
-- SAFE: All triggers being dropped are already DISABLED and have no effect.
-- The duplicate triggers are redundant (two updated_at triggers on same table).

BEGIN;

-- ============================================================================
-- PART 1: Drop all DISABLED triggers (23 triggers)
-- These are already OFF — removing dead code from the schema
-- ============================================================================

-- GL posting triggers (all disabled — app-layer GL posting via glEntryService)
DROP TRIGGER IF EXISTS trg_cost_layer_gl_failsafe ON cost_layers;
DROP TRIGGER IF EXISTS trg_post_customer_payment_to_ledger ON customer_payments;
DROP TRIGGER IF EXISTS trg_post_expense_to_ledger ON expenses;
DROP TRIGGER IF EXISTS trg_post_goods_receipt_to_ledger ON goods_receipts;
DROP TRIGGER IF EXISTS trg_post_invoice_payment_to_ledger ON invoice_payments;
DROP TRIGGER IF EXISTS trg_post_customer_invoice_to_ledger ON invoices;
DROP TRIGGER IF EXISTS trg_post_sale_to_ledger ON sales;
DROP TRIGGER IF EXISTS trg_post_sale_void_to_ledger ON sales;
DROP TRIGGER IF EXISTS trg_post_stock_movement_to_ledger ON stock_movements;
DROP TRIGGER IF EXISTS trg_post_supplier_invoice_to_ledger ON supplier_invoices;
DROP TRIGGER IF EXISTS trg_post_supplier_payment_to_ledger ON supplier_payments;
DROP TRIGGER IF EXISTS trg_post_customer_deposit_to_ledger ON pos_customer_deposits;
DROP TRIGGER IF EXISTS trg_post_deposit_application_to_ledger ON pos_deposit_applications;

-- Sync triggers (all disabled — app-layer sync in service methods)
DROP TRIGGER IF EXISTS trg_sync_supplier_on_gr_complete ON goods_receipts;
DROP TRIGGER IF EXISTS trg_sync_customer_on_invoice ON invoices;
DROP TRIGGER IF EXISTS trg_sync_invoice_ar_balance ON invoices;
DROP TRIGGER IF EXISTS trg_sync_invoice_to_customer ON invoices;
DROP TRIGGER IF EXISTS trg_sync_ledger_from_journal ON journal_entries;
DROP TRIGGER IF EXISTS trg_sync_supplier_on_invoice ON supplier_invoices;
DROP TRIGGER IF EXISTS trg_supplier_payment_allocation_sync ON supplier_payment_allocations;
DROP TRIGGER IF EXISTS trg_sync_supplier_on_payment ON supplier_payments;

-- Other disabled triggers
DROP TRIGGER IF EXISTS trg_update_deposit_status ON pos_customer_deposits;
DROP TRIGGER IF EXISTS trg_sale_items_set_product_type ON sale_items;

-- ============================================================================
-- PART 2: Drop duplicate updated_at triggers (2 duplicates)
-- customer_groups and pricing_tiers each have TWO updated_at triggers
-- Keep the generic update_updated_at_column version, drop the specific one
-- ============================================================================

DROP TRIGGER IF EXISTS trg_customer_groups_updated_at ON customer_groups;
DROP TRIGGER IF EXISTS trg_pricing_tiers_updated_at ON pricing_tiers;

-- ============================================================================
-- PART 3: Drop orphaned trigger functions (no longer referenced by any trigger)
-- Only drop functions whose ONLY callers were the disabled triggers above
-- ============================================================================

-- GL posting functions (all were disabled triggers, none called from app code)
DROP FUNCTION IF EXISTS fn_post_cost_layer_to_gl() CASCADE;
DROP FUNCTION IF EXISTS fn_post_customer_deposit_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_customer_invoice_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_customer_payment_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_deposit_application_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_expense_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_goods_receipt_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_invoice_payment_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_sale_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_sale_void_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_stock_movement_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_supplier_invoice_to_ledger() CASCADE;
DROP FUNCTION IF EXISTS fn_post_supplier_payment_to_ledger() CASCADE;

-- Sync functions (all were disabled triggers)
DROP FUNCTION IF EXISTS fn_sync_customer_on_invoice_change() CASCADE;
DROP FUNCTION IF EXISTS fn_sync_invoice_ar_balance() CASCADE;
DROP FUNCTION IF EXISTS fn_sync_supplier_on_invoice_change() CASCADE;
DROP FUNCTION IF EXISTS fn_sync_supplier_on_payment() CASCADE;
DROP FUNCTION IF EXISTS fn_sync_supplier_payment_allocation() CASCADE;
DROP FUNCTION IF EXISTS sync_invoice_to_customer() CASCADE;
DROP FUNCTION IF EXISTS sync_ledger_from_journal() CASCADE;
DROP FUNCTION IF EXISTS sync_supplier_on_gr_complete() CASCADE;

-- Other orphaned functions
DROP FUNCTION IF EXISTS update_deposit_status_and_available() CASCADE;
DROP FUNCTION IF EXISTS fn_sale_items_set_product_type() CASCADE;

-- Duplicate updated_at functions (only if no remaining triggers use them)
DROP FUNCTION IF EXISTS update_customer_groups_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_pricing_tiers_updated_at() CASCADE;

COMMIT;
