-- Migration: Add advanced inventory and supplier management columns
-- Date: 2025-01-24
-- Purpose: Support max stock levels, supplier lead times, and minimum order amounts
-- Status: OPTIONAL - Enable when implementing advanced inventory/supplier features

-- Add max_stock_level to products table
-- Enables BR-INV-009: Maximum stock level validation
ALTER TABLE products
ADD COLUMN IF NOT EXISTS max_stock_level DECIMAL(15, 4) NULL,
ADD COLUMN IF NOT EXISTS reorder_point DECIMAL(15, 4) NULL,
ADD COLUMN IF NOT EXISTS optimal_stock_level DECIMAL(15, 4) NULL;

COMMENT ON COLUMN products.max_stock_level IS 'Maximum stock quantity allowed (triggers overstock warning)';
COMMENT ON COLUMN products.reorder_point IS 'Stock level that triggers reorder recommendations';
COMMENT ON COLUMN products.optimal_stock_level IS 'Target stock level for inventory optimization';

-- Add supplier performance columns
-- Enables BR-PO-011: Supplier lead time validation
-- Enables BR-PO-012: Minimum order value validation
ALTER TABLE suppliers
ADD COLUMN IF NOT EXISTS lead_time_days INTEGER NULL DEFAULT 7,
ADD COLUMN IF NOT EXISTS minimum_order_amount DECIMAL(15, 2) NULL,
ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER NULL DEFAULT 30,
ADD COLUMN IF NOT EXISTS preferred BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN suppliers.lead_time_days IS 'Expected delivery time in days (for order planning)';
COMMENT ON COLUMN suppliers.minimum_order_amount IS 'Minimum order value required by supplier';
COMMENT ON COLUMN suppliers.payment_terms_days IS 'Standard payment terms (e.g., Net 30)';
COMMENT ON COLUMN suppliers.preferred IS 'Mark as preferred supplier for product sourcing';

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_products_stock_levels ON products(max_stock_level, reorder_point)
WHERE max_stock_level IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_lead_time ON suppliers(lead_time_days)
WHERE lead_time_days IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_suppliers_preferred ON suppliers(preferred)
WHERE preferred = true;

-- Note: After running this migration, uncomment the validation logic in:
-- - SamplePOS.Server/src/middleware/businessRules.ts:
--   * InventoryBusinessRules.validateMaxStockLevel (BR-INV-009)
--   * PurchaseOrderBusinessRules.validateLeadTime (BR-PO-011)
--   * PurchaseOrderBusinessRules.validateMinimumOrderValue (BR-PO-012)
