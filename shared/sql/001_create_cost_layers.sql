-- Migration: Create Cost Layers Table
-- Purpose: Track FIFO/AVCO inventory cost valuation layers
-- Date: 2025-10-31

CREATE TABLE IF NOT EXISTS cost_layers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity DECIMAL(15, 4) NOT NULL CHECK (quantity > 0),
    remaining_quantity DECIMAL(15, 4) NOT NULL CHECK (remaining_quantity >= 0),
    unit_cost DECIMAL(15, 2) NOT NULL CHECK (unit_cost >= 0),
    received_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    goods_receipt_id UUID REFERENCES goods_receipts(id) ON DELETE SET NULL,
    batch_number VARCHAR(100),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Ensure remaining quantity never exceeds original quantity
    CONSTRAINT chk_remaining_lte_quantity CHECK (remaining_quantity <= quantity)
);

-- Indexes for optimal query performance
CREATE INDEX idx_cost_layers_product_id ON cost_layers(product_id);
CREATE INDEX idx_cost_layers_active_remaining ON cost_layers(is_active, remaining_quantity) 
    WHERE is_active = TRUE AND remaining_quantity > 0;
CREATE INDEX idx_cost_layers_received_date ON cost_layers(product_id, received_date) 
    WHERE is_active = TRUE;
CREATE INDEX idx_cost_layers_goods_receipt ON cost_layers(goods_receipt_id) 
    WHERE goods_receipt_id IS NOT NULL;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_cost_layers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cost_layers_updated_at
    BEFORE UPDATE ON cost_layers
    FOR EACH ROW
    EXECUTE FUNCTION update_cost_layers_updated_at();

-- Comments for documentation
COMMENT ON TABLE cost_layers IS 'Tracks inventory cost valuation layers for FIFO/AVCO costing methods';
COMMENT ON COLUMN cost_layers.quantity IS 'Original quantity received in this layer';
COMMENT ON COLUMN cost_layers.remaining_quantity IS 'Quantity remaining after sales (FIFO deduction)';
COMMENT ON COLUMN cost_layers.unit_cost IS 'Cost per unit for this layer';
COMMENT ON COLUMN cost_layers.received_date IS 'Date when inventory was received (determines FIFO order)';
COMMENT ON COLUMN cost_layers.is_active IS 'False when layer is fully depleted (remaining_quantity = 0)';
