-- ============================================================
-- PERFORMANCE OPTIMIZATION INDEXES
-- Migration: 100_performance_indexes.sql
-- Purpose: Add indexes for high-traffic queries and optimize JOIN operations
-- Date: November 18, 2025
-- Target Database: pos_system (PostgreSQL)
-- ============================================================

-- Drop conflicting indexes if they exist (from old schema)
DROP INDEX IF EXISTS idx_products_sku;
DROP INDEX IF EXISTS idx_products_name;
DROP INDEX IF EXISTS idx_products_category;

-- Products: Case-insensitive search optimization (critical for POS search)
CREATE INDEX IF NOT EXISTS idx_products_sku_lower ON products(LOWER(sku)) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_name_lower ON products(LOWER(name)) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_barcode_lower ON products(LOWER(barcode)) WHERE barcode IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_active_reorder ON products(reorder_level, quantity_on_hand) 
  WHERE is_active = true AND quantity_on_hand <= reorder_level;

-- Inventory Batches: FEFO queries are critical
CREATE INDEX IF NOT EXISTS idx_batches_product_status_expiry 
  ON inventory_batches(product_id, status, expiry_date, remaining_quantity)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_batches_product_remaining 
  ON inventory_batches(product_id, remaining_quantity)
  WHERE status = 'ACTIVE' AND remaining_quantity > 0;

-- Stock Movements: Audit trail queries by date range and type
CREATE INDEX IF NOT EXISTS idx_movements_product_date 
  ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_user_date 
  ON stock_movements(created_by_id, created_at DESC) 
  WHERE created_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movements_reference 
  ON stock_movements(reference_type, reference_id)
  WHERE reference_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_movements_type_date 
  ON stock_movements(movement_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_movements_batch_date
  ON stock_movements(batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;

-- Sales: Reporting and analytics queries (critical for business intelligence)
CREATE INDEX IF NOT EXISTS idx_sales_date_status 
  ON sales(sale_date DESC, status);
CREATE INDEX IF NOT EXISTS idx_sales_customer_date 
  ON sales(customer_id, sale_date DESC)
  WHERE customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_cashier_date 
  ON sales(cashier_id, created_at DESC)
  WHERE cashier_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_number_upper 
  ON sales(UPPER(sale_number));
CREATE INDEX IF NOT EXISTS idx_sales_status
  ON sales(status, sale_date DESC)
  WHERE status = 'COMPLETED';
CREATE INDEX IF NOT EXISTS idx_sales_payment_method
  ON sales(payment_method, sale_date DESC);

-- Sale Items: Aggregation and product analysis queries
CREATE INDEX IF NOT EXISTS idx_sale_items_sale 
  ON sale_items(sale_id, product_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product 
  ON sale_items(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sale_items_batch
  ON sale_items(batch_id, created_at DESC)
  WHERE batch_id IS NOT NULL;

-- Customers: Search and lookup
CREATE INDEX IF NOT EXISTS idx_customers_name_lower 
  ON customers(LOWER(name))
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_customers_phone 
  ON customers(phone)
  WHERE phone IS NOT NULL AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_customers_group_active 
  ON customers(customer_group_id, is_active);

-- Purchase Orders: Workflow queries
-- Drop conflicting indexes if they exist
DROP INDEX IF EXISTS idx_po_number;
DROP INDEX IF EXISTS idx_po_supplier;
DROP INDEX IF EXISTS idx_po_status;

CREATE INDEX IF NOT EXISTS idx_po_supplier_status 
  ON purchase_orders(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_po_status_date 
  ON purchase_orders(status, order_date DESC);
CREATE INDEX IF NOT EXISTS idx_po_order_number_upper 
  ON purchase_orders(UPPER(order_number));
CREATE INDEX IF NOT EXISTS idx_po_created_by 
  ON purchase_orders(created_by_id)
  WHERE created_by_id IS NOT NULL;

-- Goods Receipts: Receiving workflow
-- Drop conflicting indexes if they exist
DROP INDEX IF EXISTS idx_gr_number;
DROP INDEX IF EXISTS idx_gr_po;
DROP INDEX IF EXISTS idx_gr_status;

CREATE INDEX IF NOT EXISTS idx_gr_po_status 
  ON goods_receipts(purchase_order_id, status);
CREATE INDEX IF NOT EXISTS idx_gr_status_date 
  ON goods_receipts(status, received_date DESC);
CREATE INDEX IF NOT EXISTS idx_gr_received_by 
  ON goods_receipts(received_by_id)
  WHERE received_by_id IS NOT NULL;

-- Multi-UoM Performance
-- NOTE: product_uoms table not yet created in schema
-- Uncomment these indexes after Multi-UoM tables are created:
-- CREATE INDEX IF NOT EXISTS idx_product_uoms_product_default 
--   ON product_uoms(product_id, is_default);
-- CREATE INDEX IF NOT EXISTS idx_product_uoms_uom_product 
--   ON product_uoms(uom_id, product_id);
-- CREATE INDEX IF NOT EXISTS idx_product_uoms_barcode 
--   ON product_uoms(barcode)
--   WHERE barcode IS NOT NULL;

-- Users: Authentication queries
CREATE INDEX IF NOT EXISTS idx_users_email_lower 
  ON users(LOWER(email))
  WHERE is_active = true;

-- Cost Layers: FIFO/AVCO inventory costing
CREATE INDEX IF NOT EXISTS idx_cost_layers_product_received 
  ON cost_layers(product_id, received_date ASC)
  WHERE is_active = true AND remaining_quantity > 0;
CREATE INDEX IF NOT EXISTS idx_cost_layers_product_active 
  ON cost_layers(product_id, is_active);

-- Pricing Tiers: Customer group pricing lookups
CREATE INDEX IF NOT EXISTS idx_pricing_product_group 
  ON pricing_tiers(product_id, customer_group_id, priority DESC)
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_validity 
  ON pricing_tiers(valid_from, valid_until)
  WHERE is_active = true AND valid_from IS NOT NULL;

-- Physical Stock Counts
-- NOTE: stock_counts table not yet created in schema (Physical Counting uses stock_movements)
-- Uncomment these indexes after dedicated stock_counts tables are created:
-- CREATE INDEX IF NOT EXISTS idx_stock_counts_status_date 
--   ON stock_counts(status, count_date DESC);
-- CREATE INDEX IF NOT EXISTS idx_stock_count_lines_count 
--   ON stock_count_lines(stock_count_id, product_id);

-- Partial indexes for active records only (reduces index size)
CREATE INDEX IF NOT EXISTS idx_products_active_only 
  ON products(id, name, sku, unit_price)
  WHERE is_active = true;

-- ANALYZE tables to update statistics
ANALYZE products;
ANALYZE inventory_batches;
ANALYZE stock_movements;
ANALYZE sales;
ANALYZE sale_items;
ANALYZE customers;
ANALYZE purchase_orders;
ANALYZE goods_receipts;
ANALYZE cost_layers;
ANALYZE pricing_tiers;

-- ============================================================
-- INDEX MAINTENANCE QUERIES
-- ============================================================

-- Check index usage stats (run periodically to verify effectiveness)
-- SELECT 
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan as index_scans,
--   idx_tup_read as tuples_read,
--   idx_tup_fetch as tuples_fetched
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- Find missing indexes (queries with high seq_scan)
-- SELECT 
--   schemaname,
--   tablename,
--   seq_scan,
--   seq_tup_read,
--   seq_tup_read / NULLIF(seq_scan, 0) as avg_tuples_per_scan
-- FROM pg_stat_user_tables
-- WHERE schemaname = 'public'
-- ORDER BY seq_scan DESC
-- LIMIT 20;
