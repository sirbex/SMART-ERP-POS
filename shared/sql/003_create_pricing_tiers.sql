-- Migration: Create Pricing Tiers Table
-- Purpose: Flexible pricing rules per product/customer group/quantity range
-- Date: 2025-10-31

CREATE TABLE IF NOT EXISTS pricing_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    customer_group_id UUID REFERENCES customer_groups(id) ON DELETE CASCADE,
    name VARCHAR(255),
    pricing_formula TEXT NOT NULL,
    calculated_price DECIMAL(15, 2) NOT NULL CHECK (calculated_price >= 0),
    min_quantity DECIMAL(15, 4) NOT NULL DEFAULT 1 CHECK (min_quantity > 0),
    max_quantity DECIMAL(15, 4) CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    priority INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure valid date range
    CONSTRAINT chk_pricing_tiers_date_range CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)
);

-- Indexes for optimal query performance
CREATE INDEX idx_pricing_tiers_product_id ON pricing_tiers(product_id);
CREATE INDEX idx_pricing_tiers_customer_group_id ON pricing_tiers(customer_group_id) 
    WHERE customer_group_id IS NOT NULL;
CREATE INDEX idx_pricing_tiers_active ON pricing_tiers(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_pricing_tiers_lookup ON pricing_tiers(product_id, customer_group_id, min_quantity, is_active) 
    WHERE is_active = TRUE;
CREATE INDEX idx_pricing_tiers_priority ON pricing_tiers(product_id, priority DESC) 
    WHERE is_active = TRUE;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_pricing_tiers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pricing_tiers_updated_at
    BEFORE UPDATE ON pricing_tiers
    FOR EACH ROW
    EXECUTE FUNCTION update_pricing_tiers_updated_at();

-- Comments for documentation
COMMENT ON TABLE pricing_tiers IS 'Flexible pricing rules with formula-based calculation per product, customer group, and quantity range';
COMMENT ON COLUMN pricing_tiers.pricing_formula IS 'JavaScript formula (e.g., "cost * 1.20" for 20% markup)';
COMMENT ON COLUMN pricing_tiers.calculated_price IS 'Cached result of formula evaluation (updated when cost changes)';
COMMENT ON COLUMN pricing_tiers.min_quantity IS 'Minimum order quantity for this tier to apply';
COMMENT ON COLUMN pricing_tiers.max_quantity IS 'Maximum order quantity (NULL = no upper limit)';
COMMENT ON COLUMN pricing_tiers.priority IS 'Higher priority tiers win when multiple match (higher number = higher priority)';
COMMENT ON COLUMN pricing_tiers.valid_from IS 'Optional start date for seasonal/promotional pricing';
COMMENT ON COLUMN pricing_tiers.valid_until IS 'Optional end date for seasonal/promotional pricing';
