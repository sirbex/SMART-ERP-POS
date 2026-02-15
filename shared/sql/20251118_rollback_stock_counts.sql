-- Rollback Migration: Physical Counting (Stocktake) Feature
-- Created: 2025-11-18
-- Description: Drop stock counting tables and related objects

-- Drop trigger
DROP TRIGGER IF EXISTS trigger_update_stock_count_lines_updated_at ON stock_count_lines;
DROP FUNCTION IF EXISTS update_stock_count_lines_updated_at();

-- Drop indexes
DROP INDEX IF EXISTS idx_stock_movements_stock_count;
DROP INDEX IF EXISTS idx_stock_count_lines_batch;
DROP INDEX IF EXISTS idx_stock_count_lines_product;
DROP INDEX IF EXISTS idx_stock_count_lines_count;
DROP INDEX IF EXISTS idx_stock_counts_created_at;
DROP INDEX IF EXISTS idx_stock_counts_created_by;
DROP INDEX IF EXISTS idx_stock_counts_state;

-- Remove stock_count_id from stock_movements
ALTER TABLE stock_movements 
DROP COLUMN IF EXISTS stock_count_id;

-- Drop tables (cascade will drop foreign key constraints)
DROP TABLE IF EXISTS stock_count_lines CASCADE;
DROP TABLE IF EXISTS stock_counts CASCADE;

-- Drop ENUM type
DROP TYPE IF EXISTS stock_count_state;

-- Note: We don't drop received_date and expiry_date from inventory_batches
-- as they may be used by other features
