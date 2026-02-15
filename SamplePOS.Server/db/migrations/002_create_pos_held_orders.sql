-- Migration: Create POS Held Orders Tables
-- Date: November 23, 2025
-- Purpose: Support "Put on Hold" and "Resume" cart functionality (Odoo POS-like)

-- Table: pos_held_orders
-- Stores cart state temporarily without creating invoices or stock movements
CREATE TABLE pos_held_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_number VARCHAR(50) UNIQUE NOT NULL, -- HOLD-YYYY-####
  terminal_id VARCHAR(100) NULL, -- POS terminal identifier
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id UUID NULL REFERENCES customers(id) ON DELETE SET NULL,
  customer_name VARCHAR(255) NULL, -- Denormalized for display
  
  -- Financial summary (for display only - not finalized)
  subtotal NUMERIC(15, 4) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  total_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  
  -- Hold metadata
  hold_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  metadata JSONB NULL, -- Additional cart state (discounts, payment lines draft, etc.)
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL, -- Optional expiration (e.g., 24 hours)
  
  -- Constraints
  CONSTRAINT chk_pos_held_orders_amounts CHECK (
    subtotal >= 0 AND
    tax_amount >= 0 AND
    discount_amount >= 0 AND
    total_amount >= 0
  )
);

-- Table: pos_held_order_items
-- Line items for held orders
CREATE TABLE pos_held_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hold_id UUID NOT NULL REFERENCES pos_held_orders(id) ON DELETE CASCADE,
  
  -- Product information
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_name VARCHAR(255) NOT NULL, -- Denormalized
  product_sku VARCHAR(100) NULL, -- Denormalized
  product_type VARCHAR(20) NOT NULL DEFAULT 'inventory', -- inventory, consumable, service
  
  -- Quantity and pricing
  quantity NUMERIC(15, 4) NOT NULL,
  unit_price NUMERIC(15, 4) NOT NULL,
  cost_price NUMERIC(15, 4) NOT NULL DEFAULT 0,
  subtotal NUMERIC(15, 4) NOT NULL,
  
  -- Tax
  is_taxable BOOLEAN NOT NULL DEFAULT true,
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  
  -- Discount (item-level)
  discount_type VARCHAR(20) NULL, -- PERCENTAGE, FIXED_AMOUNT
  discount_value NUMERIC(15, 4) NULL,
  discount_amount NUMERIC(15, 4) NOT NULL DEFAULT 0,
  discount_reason TEXT NULL,
  
  -- UoM support
  uom_id UUID NULL, -- REFERENCES units_of_measure(id) ON DELETE SET NULL (commented - add when UoM table exists)
  uom_name VARCHAR(100) NULL, -- Denormalized
  uom_conversion_factor NUMERIC(15, 6) NULL,
  
  -- Metadata
  metadata JSONB NULL, -- Additional item state (batch preference, notes, etc.)
  
  -- Sort order
  line_order INTEGER NOT NULL DEFAULT 0,
  
  -- Constraints
  CONSTRAINT chk_pos_held_order_items_amounts CHECK (
    quantity > 0 AND
    unit_price >= 0 AND
    cost_price >= 0 AND
    subtotal >= 0 AND
    tax_rate >= 0 AND
    tax_amount >= 0 AND
    discount_amount >= 0
  )
);

-- Indexes for performance
CREATE INDEX idx_pos_held_orders_user_id ON pos_held_orders(user_id);
CREATE INDEX idx_pos_held_orders_terminal_id ON pos_held_orders(terminal_id) WHERE terminal_id IS NOT NULL;
CREATE INDEX idx_pos_held_orders_created_at ON pos_held_orders(created_at DESC);
CREATE INDEX idx_pos_held_orders_expires_at ON pos_held_orders(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_pos_held_orders_hold_number ON pos_held_orders(hold_number);

CREATE INDEX idx_pos_held_order_items_hold_id ON pos_held_order_items(hold_id);
CREATE INDEX idx_pos_held_order_items_product_id ON pos_held_order_items(product_id);
CREATE INDEX idx_pos_held_order_items_line_order ON pos_held_order_items(hold_id, line_order);

-- Sequence for hold numbers
CREATE SEQUENCE IF NOT EXISTS hold_number_seq START WITH 1;

-- Function to generate hold number
CREATE OR REPLACE FUNCTION generate_hold_number()
RETURNS VARCHAR(50) AS $$
DECLARE
  current_year INTEGER;
  next_seq INTEGER;
  hold_num VARCHAR(50);
BEGIN
  current_year := EXTRACT(YEAR FROM NOW());
  next_seq := nextval('hold_number_seq');
  hold_num := 'HOLD-' || current_year || '-' || LPAD(next_seq::TEXT, 4, '0');
  RETURN hold_num;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate hold number
CREATE OR REPLACE FUNCTION set_hold_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.hold_number IS NULL OR NEW.hold_number = '' THEN
    NEW.hold_number := generate_hold_number();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_hold_number
BEFORE INSERT ON pos_held_orders
FOR EACH ROW
EXECUTE FUNCTION set_hold_number();

-- Comments
COMMENT ON TABLE pos_held_orders IS 'Temporarily held POS carts - NOT invoices or sales';
COMMENT ON COLUMN pos_held_orders.terminal_id IS 'POS terminal/device identifier for multi-till support';
COMMENT ON COLUMN pos_held_orders.metadata IS 'Draft payment lines, cart-level discounts, etc.';
COMMENT ON COLUMN pos_held_orders.expires_at IS 'Optional expiration for auto-cleanup (default: 24 hours)';

COMMENT ON TABLE pos_held_order_items IS 'Line items for held orders - exact cart state';
COMMENT ON COLUMN pos_held_order_items.product_type IS 'Product type: inventory, consumable, or service';
COMMENT ON COLUMN pos_held_order_items.metadata IS 'Batch preferences, item notes, custom fields';
