-- Migration: Rollback Script for Pricing & Costing System
-- Purpose: Remove all pricing and costing tables and columns
-- Date: 2025-10-31
-- WARNING: This will permanently delete all pricing and costing data

-- Drop triggers first
DROP TRIGGER IF EXISTS trg_pricing_tiers_updated_at ON pricing_tiers;
DROP TRIGGER IF EXISTS trg_customer_groups_updated_at ON customer_groups;
DROP TRIGGER IF EXISTS trg_cost_layers_updated_at ON cost_layers;

-- Drop functions
DROP FUNCTION IF EXISTS update_pricing_tiers_updated_at();
DROP FUNCTION IF EXISTS update_customer_groups_updated_at();
DROP FUNCTION IF EXISTS update_cost_layers_updated_at();

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS pricing_tiers;
DROP TABLE IF EXISTS cost_layers;

-- Remove customer_group_id from customers
ALTER TABLE customers DROP COLUMN IF EXISTS customer_group_id;

-- Drop customer_groups table
DROP TABLE IF EXISTS customer_groups;

-- Remove costing/pricing columns from products
ALTER TABLE products 
    DROP COLUMN IF EXISTS costing_method,
    DROP COLUMN IF EXISTS average_cost,
    DROP COLUMN IF EXISTS last_cost,
    DROP COLUMN IF EXISTS pricing_formula,
    DROP COLUMN IF EXISTS auto_update_price;

-- Drop costing_method enum type
DROP TYPE IF EXISTS costing_method;

-- Note: This script should only be used in development/testing
-- For production, consider archiving data before dropping tables
