-- Migration 411: Add version column for optimistic concurrency control
-- 
-- Adds an integer version column to concurrency-sensitive tables.
-- Every UPDATE must SET version = version + 1.
-- Client reads include version; on write, WHERE version = <read_version>
-- detects lost updates → 409 Conflict.
--
-- Backward compatible: version defaults to 1, existing code still works.

BEGIN;

-- Products (vertical partition: master + inventory + valuation)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE product_inventory
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE product_valuation
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Customers (concurrent sales update balance)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Purchase orders (status transitions)
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Goods receipts (status transitions, item edits, finalization)
ALTER TABLE goods_receipts
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE goods_receipt_items
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Quotations (status transitions, edits)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Suppliers (concurrent edits)
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Discounts (approval workflows)
ALTER TABLE discounts
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Inventory batches (concurrent deductions)
ALTER TABLE inventory_batches
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

-- Cash register sessions (concurrent close/reconcile)
ALTER TABLE cash_register_sessions
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

COMMIT;
