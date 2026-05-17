-- Migration 517: Add order_created_by_user_id to sales
-- Separates "who placed the order" from "who processed the payment"
-- (mirrors SAP/Odoo accountability design)
--
-- When both users are the same → direct sale at POS
-- When different → queue workflow (staff queued, cashier processed)
-- No "mode" column is stored — mode is inferred at read time

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS order_created_by_user_id UUID REFERENCES users(id);

-- Backfill: all existing sales treated as direct sales (cashier = creator)
UPDATE sales
  SET order_created_by_user_id = cashier_id
WHERE order_created_by_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_sales_order_created_by ON sales(order_created_by_user_id);

INSERT INTO schema_version (version) VALUES (516);
