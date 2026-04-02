-- Migration 062: Drop all 18 updated_at auto-setter triggers
-- Architecture: "Database is PASSIVE STORAGE ONLY"
-- All UPDATE queries in the service/repository layer now include updated_at = NOW() explicitly.
-- These triggers are redundant and violate the passive-storage principle.
--
-- Date: 2026-04-02

BEGIN;

-- ============================================================
-- Phase 1: Drop all 18 updated_at triggers
-- ============================================================

DROP TRIGGER IF EXISTS trg_cost_layers_updated_at ON cost_layers;
DROP TRIGGER IF EXISTS update_customer_groups_updated_at ON customer_groups;
DROP TRIGGER IF EXISTS trg_delivery_orders_update_timestamp ON delivery_orders;
DROP TRIGGER IF EXISTS trg_delivery_routes_update_timestamp ON delivery_routes;
DROP TRIGGER IF EXISTS update_discounts_updated_at ON discounts;
DROP TRIGGER IF EXISTS expense_approvals_updated_at ON expense_approvals;
DROP TRIGGER IF EXISTS expense_categories_updated_at ON expense_categories;
DROP TRIGGER IF EXISTS expenses_updated_at ON expenses;
DROP TRIGGER IF EXISTS update_gr_updated_at ON goods_receipts;
DROP TRIGGER IF EXISTS update_batches_updated_at ON inventory_batches;
DROP TRIGGER IF EXISTS update_pricing_tiers_updated_at ON pricing_tiers;
DROP TRIGGER IF EXISTS update_products_updated_at ON products;
DROP TRIGGER IF EXISTS update_po_updated_at ON purchase_orders;
DROP TRIGGER IF EXISTS trg_update_quotation_timestamp ON quotations;
DROP TRIGGER IF EXISTS trigger_update_stock_count_lines_updated_at ON stock_count_lines;
DROP TRIGGER IF EXISTS trigger_update_system_settings_timestamp ON system_settings;
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;

-- ============================================================
-- Phase 2: Drop orphaned trigger functions (no longer referenced)
-- ============================================================

-- Generic updated_at function (was used by 8 triggers above, no other consumers)
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;

-- Table-specific updated_at functions
DROP FUNCTION IF EXISTS update_cost_layers_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_delivery_timestamps() CASCADE;
DROP FUNCTION IF EXISTS update_expense_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_quotation_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_stock_count_lines_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_system_settings_timestamp() CASCADE;
DROP FUNCTION IF EXISTS update_tenant_updated_at() CASCADE;

COMMIT;
