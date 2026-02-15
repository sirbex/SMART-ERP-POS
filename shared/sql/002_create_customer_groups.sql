-- Migration: Create Customer Groups Table
-- Purpose: Group customers for pricing tiers and bulk discounts
-- Date: 2025-10-31

CREATE TABLE IF NOT EXISTS customer_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    discount_percentage DECIMAL(5, 4) NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 1),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for optimal query performance
CREATE INDEX idx_customer_groups_name ON customer_groups(name);
CREATE INDEX idx_customer_groups_active ON customer_groups(is_active) WHERE is_active = TRUE;

-- Add customer_group_id to customers table
ALTER TABLE customers 
    ADD COLUMN IF NOT EXISTS customer_group_id UUID REFERENCES customer_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_customers_group ON customers(customer_group_id) WHERE customer_group_id IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customer_groups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_customer_groups_updated_at
    BEFORE UPDATE ON customer_groups
    FOR EACH ROW
    EXECUTE FUNCTION update_customer_groups_updated_at();

-- Comments for documentation
COMMENT ON TABLE customer_groups IS 'Groups customers for pricing tiers and bulk discounts (e.g., Wholesale, Retail, VIP)';
COMMENT ON COLUMN customer_groups.discount_percentage IS 'Percentage discount for all group members (0.10 = 10% discount)';
COMMENT ON COLUMN customers.customer_group_id IS 'Associates customer with a pricing group for special rates';
