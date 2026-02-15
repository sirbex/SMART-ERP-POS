-- Migration: Add Pricing & Costing Columns to Products
-- Purpose: Extend products table with costing method and pricing formula support
-- Date: 2025-10-31

-- Add costing_method enum type
DO $$ BEGIN
    CREATE TYPE costing_method AS ENUM ('FIFO', 'AVCO', 'STANDARD');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add new columns to products table
ALTER TABLE products 
    ADD COLUMN IF NOT EXISTS costing_method costing_method NOT NULL DEFAULT 'FIFO',
    ADD COLUMN IF NOT EXISTS average_cost DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (average_cost >= 0),
    ADD COLUMN IF NOT EXISTS last_cost DECIMAL(15, 2) NOT NULL DEFAULT 0 CHECK (last_cost >= 0),
    ADD COLUMN IF NOT EXISTS pricing_formula TEXT,
    ADD COLUMN IF NOT EXISTS auto_update_price BOOLEAN NOT NULL DEFAULT FALSE;

-- Create index for products using auto price updates
CREATE INDEX idx_products_auto_update ON products(auto_update_price) 
    WHERE auto_update_price = TRUE;

-- Comments for documentation
COMMENT ON COLUMN products.costing_method IS 'Inventory valuation method: FIFO (oldest first), AVCO (weighted average), or STANDARD (fixed cost)';
COMMENT ON COLUMN products.average_cost IS 'Weighted average cost calculated from cost layers';
COMMENT ON COLUMN products.last_cost IS 'Most recent purchase cost (from latest goods receipt)';
COMMENT ON COLUMN products.pricing_formula IS 'JavaScript formula for auto-calculating selling price (e.g., "cost * 1.25" for 25% markup)';
COMMENT ON COLUMN products.auto_update_price IS 'If true, selling_price automatically recalculates when cost changes';
