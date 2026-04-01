-- Migration 056: Backfill missing product_inventory and product_valuation rows
--
-- ROOT CAUSE: safe_data_reset.sql Phase 9 deletes child table rows, Phase 16
-- resets products via UPDATE. The trg_product_create_children trigger only fires
-- on INSERT, so existing products never get their child rows recreated.
--
-- This migration inserts any missing rows from the products table into:
--   - product_inventory (quantity_on_hand, reorder_level)
--   - product_valuation (cost_price, selling_price, costing_method, etc.)
--
-- Safe to re-run (ON CONFLICT DO NOTHING).

-- ── product_inventory ──
INSERT INTO product_inventory (product_id, quantity_on_hand, reorder_level)
SELECT p.id, COALESCE(p.quantity_on_hand, 0), COALESCE(p.reorder_level, 0)
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_inventory pi WHERE pi.product_id = p.id
)
ON CONFLICT (product_id) DO NOTHING;

-- ── product_valuation ──
INSERT INTO product_valuation (
  product_id, cost_price, selling_price, average_cost, last_cost,
  costing_method, pricing_formula, auto_update_price
)
SELECT
  p.id,
  COALESCE(p.cost_price, 0),
  COALESCE(p.selling_price, 0),
  COALESCE(p.cost_price, 0),   -- average_cost defaults to cost_price
  COALESCE(p.cost_price, 0),   -- last_cost defaults to cost_price
  COALESCE(p.costing_method, 'FIFO'),
  p.pricing_formula,
  COALESCE(p.auto_update_price, false)
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_valuation pv WHERE pv.product_id = p.id
)
ON CONFLICT (product_id) DO NOTHING;
