-- Migration: UoM conversion fixes
-- Date: 2026-04-13
-- Description: 
--   1. Add missing columns to purchase_order_items for base-unit tracking
--   2. Clear erroneous price/cost overrides on product_uoms that match base price
--      (these prevent the COALESCE formula from computing correct UoM-scaled prices)

-- 1. Add base-unit columns to purchase_order_items (IF NOT EXISTS for idempotency)
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS base_qty NUMERIC(15,4);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES uoms(id);
ALTER TABLE purchase_order_items ADD COLUMN IF NOT EXISTS conversion_factor NUMERIC(10,4) DEFAULT 1;

-- 2. Clear price/cost overrides that match the base product price
--    These are erroneous: they prevent the formula (selling_price * conversion_factor) from working
--    Only clears overrides where the override equals the base selling_price (within rounding)
UPDATE product_uoms pu
SET price_override = NULL, cost_override = NULL
WHERE (price_override IS NOT NULL OR cost_override IS NOT NULL)
  AND EXISTS (
    SELECT 1 FROM product_valuation pv
    WHERE pv.product_id = pu.product_id
      AND (
        (pu.price_override IS NOT NULL AND ABS(pu.price_override - pv.selling_price) < 0.01)
        OR (pu.cost_override IS NOT NULL AND ABS(pu.cost_override - pv.cost_price) < 0.01)
      )
  );
