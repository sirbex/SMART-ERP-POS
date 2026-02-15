-- Customer Deposits - For tracking customer advance payments
-- This table is managed by Node.js API for POS operations
-- Run this migration with: psql -U postgres -d pos_system -f shared/sql/050_customer_deposits.sql

-- Create the deposits table (Node.js managed, lowercase columns)
CREATE TABLE IF NOT EXISTS pos_customer_deposits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deposit_number VARCHAR(50) UNIQUE NOT NULL,  -- DEP-2025-0001 format
    customer_id UUID NOT NULL REFERENCES customers(id),
    
    -- Amounts (using NUMERIC for precision)
    amount NUMERIC(18, 2) NOT NULL,
    amount_used NUMERIC(18, 2) NOT NULL DEFAULT 0,
    amount_available NUMERIC(18, 2) NOT NULL,  -- Calculated: amount - amount_used
    
    -- Payment details
    payment_method VARCHAR(20) NOT NULL,  -- CASH, CARD, MOBILE_MONEY, BANK_TRANSFER
    reference VARCHAR(100),               -- Transaction reference
    notes TEXT,
    
    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE, DEPLETED, REFUNDED, CANCELLED
    
    -- Audit fields
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT chk_deposit_amount_positive CHECK (amount > 0),
    CONSTRAINT chk_deposit_used_valid CHECK (amount_used >= 0 AND amount_used <= amount),
    CONSTRAINT chk_deposit_available_valid CHECK (amount_available >= 0),
    CONSTRAINT chk_deposit_status CHECK (status IN ('ACTIVE', 'DEPLETED', 'REFUNDED', 'CANCELLED'))
);

-- Index for customer lookup
CREATE INDEX IF NOT EXISTS idx_pos_deposits_customer ON pos_customer_deposits(customer_id);
CREATE INDEX IF NOT EXISTS idx_pos_deposits_status ON pos_customer_deposits(status);
CREATE INDEX IF NOT EXISTS idx_pos_deposits_active ON pos_customer_deposits(customer_id, status) WHERE status = 'ACTIVE';

-- Deposit applications - tracks which sales used which deposits
CREATE TABLE IF NOT EXISTS pos_deposit_applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deposit_id UUID NOT NULL REFERENCES pos_customer_deposits(id),
    sale_id UUID NOT NULL REFERENCES sales(id),
    amount_applied NUMERIC(18, 2) NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by UUID REFERENCES users(id),
    
    CONSTRAINT chk_application_amount_positive CHECK (amount_applied > 0)
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_deposit_applications_deposit ON pos_deposit_applications(deposit_id);
CREATE INDEX IF NOT EXISTS idx_deposit_applications_sale ON pos_deposit_applications(sale_id);

-- Function to auto-update deposit status when amount_used changes
CREATE OR REPLACE FUNCTION update_deposit_status_and_available()
RETURNS TRIGGER AS $$
BEGIN
    -- Update amount_available
    NEW.amount_available := NEW.amount - NEW.amount_used;
    
    -- Update status based on remaining balance
    IF NEW.amount_available <= 0 THEN
        NEW.status := 'DEPLETED';
    ELSIF NEW.status = 'DEPLETED' AND NEW.amount_available > 0 THEN
        -- Reverting a depleted deposit back to active (e.g., voided sale)
        NEW.status := 'ACTIVE';
    END IF;
    
    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to maintain deposit status
DROP TRIGGER IF EXISTS trg_update_deposit_status ON pos_customer_deposits;
CREATE TRIGGER trg_update_deposit_status
    BEFORE UPDATE OF amount_used ON pos_customer_deposits
    FOR EACH ROW
    EXECUTE FUNCTION update_deposit_status_and_available();

-- Sequence for deposit numbers
CREATE SEQUENCE IF NOT EXISTS deposit_number_seq START WITH 1;

-- Function to generate deposit number
CREATE OR REPLACE FUNCTION generate_deposit_number()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.deposit_number IS NULL THEN
        NEW.deposit_number := 'DEP-' || TO_CHAR(NOW(), 'YYYY') || '-' || 
                              LPAD(nextval('deposit_number_seq')::TEXT, 4, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-generate deposit number
DROP TRIGGER IF EXISTS trg_generate_deposit_number ON pos_customer_deposits;
CREATE TRIGGER trg_generate_deposit_number
    BEFORE INSERT ON pos_customer_deposits
    FOR EACH ROW
    EXECUTE FUNCTION generate_deposit_number();

-- View for customer deposit balance
CREATE OR REPLACE VIEW customer_deposit_summary AS
SELECT 
    c.id AS customer_id,
    c.name AS customer_name,
    COALESCE(SUM(CASE WHEN d.status = 'ACTIVE' THEN d.amount_available ELSE 0 END), 0) AS available_deposit_balance,
    COALESCE(SUM(d.amount), 0) AS total_deposits,
    COALESCE(SUM(d.amount_used), 0) AS total_deposits_used,
    COUNT(CASE WHEN d.status = 'ACTIVE' THEN 1 END) AS active_deposit_count
FROM customers c
LEFT JOIN pos_customer_deposits d ON c.id = d.customer_id
GROUP BY c.id, c.name;

-- Grant permissions if needed
-- GRANT SELECT, INSERT, UPDATE ON pos_customer_deposits TO pos_app;
-- GRANT SELECT, INSERT ON pos_deposit_applications TO pos_app;
-- GRANT USAGE ON SEQUENCE deposit_number_seq TO pos_app;

COMMENT ON TABLE pos_customer_deposits IS 'Customer advance payments/deposits - managed by Node.js POS API';
COMMENT ON TABLE pos_deposit_applications IS 'Tracks which deposits were applied to which sales';
COMMENT ON VIEW customer_deposit_summary IS 'Summary of customer deposit balances';
