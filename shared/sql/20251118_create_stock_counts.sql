-- Migration: Physical Counting (Stocktake) Feature
-- Created: 2025-11-18
-- Description: Add tables for stock counting and reconciliation

-- Create ENUM type for stock count state
CREATE TYPE stock_count_state AS ENUM ('draft', 'counting', 'validating', 'done', 'cancelled');

-- Create stock_counts table
CREATE TABLE IF NOT EXISTS stock_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    
    -- Location/warehouse (optional for now, future multi-warehouse support)
    location_id UUID,
    
    -- State machine
    state stock_count_state NOT NULL DEFAULT 'draft',
    
    -- Audit fields
    created_by_id UUID NOT NULL REFERENCES users(id),
    validated_by_id UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    validated_at TIMESTAMPTZ,
    
    -- Snapshot data for concurrency detection
    snapshot_timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Optional notes
    notes TEXT,
    
    -- Indexes
    CONSTRAINT fk_stock_counts_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    CONSTRAINT fk_stock_counts_validated_by FOREIGN KEY (validated_by_id) REFERENCES users(id)
);

CREATE INDEX idx_stock_counts_state ON stock_counts(state);
CREATE INDEX idx_stock_counts_created_by ON stock_counts(created_by_id);
CREATE INDEX idx_stock_counts_created_at ON stock_counts(created_at DESC);

-- Create stock_count_lines table
CREATE TABLE IF NOT EXISTS stock_count_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parent stock count
    stock_count_id UUID NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
    
    -- Product and optional batch
    product_id UUID NOT NULL REFERENCES products(id),
    batch_id UUID REFERENCES inventory_batches(id),
    
    -- Expected quantity (snapshot at count creation time, in base units)
    expected_qty_base DECIMAL(15, 4) NOT NULL DEFAULT 0,
    
    -- Counted quantity (in base units, nullable until counted)
    counted_qty_base DECIMAL(15, 4),
    
    -- UOM used for recording (for display/audit)
    uom_recorded VARCHAR(50),
    
    -- Line-specific notes
    notes TEXT,
    
    -- Audit
    created_by_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT fk_stock_count_lines_count FOREIGN KEY (stock_count_id) REFERENCES stock_counts(id) ON DELETE CASCADE,
    CONSTRAINT fk_stock_count_lines_product FOREIGN KEY (product_id) REFERENCES products(id),
    CONSTRAINT fk_stock_count_lines_batch FOREIGN KEY (batch_id) REFERENCES inventory_batches(id) ON DELETE SET NULL,
    CONSTRAINT fk_stock_count_lines_created_by FOREIGN KEY (created_by_id) REFERENCES users(id),
    
    -- Prevent duplicate lines for same product/batch combination
    CONSTRAINT unique_count_product_batch UNIQUE (stock_count_id, product_id, batch_id)
);

CREATE INDEX idx_stock_count_lines_count ON stock_count_lines(stock_count_id);
CREATE INDEX idx_stock_count_lines_product ON stock_count_lines(product_id);
CREATE INDEX idx_stock_count_lines_batch ON stock_count_lines(batch_id);

-- Add stock_count_id to stock_movements for traceability
ALTER TABLE stock_movements 
ADD COLUMN IF NOT EXISTS stock_count_id UUID REFERENCES stock_counts(id);

CREATE INDEX IF NOT EXISTS idx_stock_movements_stock_count ON stock_movements(stock_count_id);

-- Ensure inventory_batches has received_date and expiry_date
ALTER TABLE inventory_batches
ADD COLUMN IF NOT EXISTS received_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- expiry_date should already exist, but add if missing
ALTER TABLE inventory_batches
ADD COLUMN IF NOT EXISTS expiry_date DATE;

-- Add trigger to update updated_at on stock_count_lines
CREATE OR REPLACE FUNCTION update_stock_count_lines_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_stock_count_lines_updated_at
    BEFORE UPDATE ON stock_count_lines
    FOR EACH ROW
    EXECUTE FUNCTION update_stock_count_lines_updated_at();

-- Comments for documentation
COMMENT ON TABLE stock_counts IS 'Physical stock counting sessions (stocktakes)';
COMMENT ON COLUMN stock_counts.state IS 'draft: being set up, counting: in progress, validating: being validated, done: completed, cancelled: aborted';
COMMENT ON COLUMN stock_counts.snapshot_timestamp IS 'Timestamp when count was created, used for concurrency detection';

COMMENT ON TABLE stock_count_lines IS 'Individual product/batch lines in a stock count';
COMMENT ON COLUMN stock_count_lines.expected_qty_base IS 'Expected quantity in base units (from system at count creation)';
COMMENT ON COLUMN stock_count_lines.counted_qty_base IS 'Actual counted quantity in base units';
COMMENT ON COLUMN stock_count_lines.uom_recorded IS 'UOM symbol used when recording count (for audit/display)';
