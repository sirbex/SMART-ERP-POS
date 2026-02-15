-- Split Payment System - Database Schema
-- Enables splitting a single sale payment across multiple payment methods
-- Supports CASH, CARD, MOBILE_MONEY, and CUSTOMER_CREDIT

-- ============================================================================
-- 1. PAYMENT METHODS TABLE
-- ============================================================================
-- Defines available payment methods in the system
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    requires_reference BOOLEAN DEFAULT false, -- e.g., card transaction ID
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default payment methods
INSERT INTO payment_methods (code, name, description, requires_reference) VALUES
    ('CASH', 'Cash', 'Physical cash payment', false),
    ('CARD', 'Card', 'Credit/Debit card payment', true),
    ('MOBILE_MONEY', 'Mobile Money', 'Mobile money transfer (MTN, Airtel, etc.)', true),
    ('CUSTOMER_CREDIT', 'Customer Credit', 'Customer account credit', false),
    ('BANK_TRANSFER', 'Bank Transfer', 'Direct bank transfer', true),
    ('CHEQUE', 'Cheque', 'Cheque payment', true)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 2. SALE PAYMENTS TABLE (Split Payment Segments)
-- ============================================================================
-- Stores individual payment segments for each sale
-- A sale can have multiple payment records if split across methods
CREATE TABLE IF NOT EXISTS sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    payment_method_code VARCHAR(50) NOT NULL REFERENCES payment_methods(code),
    amount DECIMAL(15, 2) NOT NULL CHECK (amount > 0),
    reference_number VARCHAR(100), -- Transaction ID, cheque number, etc.
    notes TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_sale_payments_sale_id ON sale_payments(sale_id);
CREATE INDEX idx_sale_payments_method ON sale_payments(payment_method_code);
CREATE INDEX idx_sale_payments_processed_at ON sale_payments(processed_at);

-- ============================================================================
-- 3. CUSTOMER CREDIT TRANSACTIONS TABLE
-- ============================================================================
-- Tracks customer credit usage and payments
-- Maintains running balance for customer accounts
CREATE TABLE IF NOT EXISTS customer_credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('CREDIT_SALE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT')),
    amount DECIMAL(15, 2) NOT NULL,
    balance_after DECIMAL(15, 2) NOT NULL, -- Running balance after this transaction
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    payment_id UUID REFERENCES sale_payments(id) ON DELETE SET NULL,
    reference_number VARCHAR(100),
    notes TEXT,
    processed_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_customer_credit_customer_id ON customer_credit_transactions(customer_id);
CREATE INDEX idx_customer_credit_type ON customer_credit_transactions(transaction_type);
CREATE INDEX idx_customer_credit_created_at ON customer_credit_transactions(created_at);
CREATE INDEX idx_customer_credit_sale_id ON customer_credit_transactions(sale_id) WHERE sale_id IS NOT NULL;

-- ============================================================================
-- 4. UPDATE SALES TABLE
-- ============================================================================
-- Add fields to support split payments
ALTER TABLE sales ADD COLUMN IF NOT EXISTS is_split_payment BOOLEAN DEFAULT false;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS total_paid DECIMAL(15, 2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS balance_due DECIMAL(15, 2) DEFAULT 0;

-- Update existing sales to set split payment flag
UPDATE sales SET is_split_payment = false WHERE is_split_payment IS NULL;
UPDATE sales SET total_paid = total_amount WHERE total_paid = 0;
UPDATE sales SET balance_due = 0 WHERE balance_due = 0;

-- ============================================================================
-- 5. TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Trigger: Update payment_methods updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_method_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_method_update_timestamp
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_method_timestamp();

-- ============================================================================
-- 6. VIEWS FOR REPORTING
-- ============================================================================

-- View: Sale Payment Summary (aggregated by sale)
CREATE OR REPLACE VIEW v_sale_payment_summary AS
SELECT 
    s.id AS sale_id,
    s.sale_number,
    s.total_amount,
    s.is_split_payment,
    COUNT(sp.id) AS payment_count,
    SUM(sp.amount) AS total_paid,
    s.total_amount - COALESCE(SUM(sp.amount), 0) AS balance_due,
    json_agg(
        json_build_object(
            'payment_method', sp.payment_method_code,
            'amount', sp.amount,
            'reference', sp.reference_number,
            'processed_at', sp.processed_at
        ) ORDER BY sp.processed_at
    ) AS payments
FROM sales s
LEFT JOIN sale_payments sp ON sp.sale_id = s.id
GROUP BY s.id, s.sale_number, s.total_amount, s.is_split_payment;

-- View: Customer Credit Balance (current balance per customer)
CREATE OR REPLACE VIEW v_customer_credit_balance AS
SELECT 
    c.id AS customer_id,
    c.customer_number,
    c.name AS customer_name,
    COALESCE(MAX(cct.balance_after), 0) AS current_balance,
    COUNT(cct.id) AS transaction_count,
    MAX(cct.created_at) AS last_transaction_date
FROM customers c
LEFT JOIN customer_credit_transactions cct ON cct.customer_id = c.id
GROUP BY c.id, c.customer_number, c.name;

-- ============================================================================
-- 7. SAMPLE QUERIES
-- ============================================================================

-- Get all payments for a sale
-- SELECT * FROM sale_payments WHERE sale_id = '<sale_id>' ORDER BY processed_at;

-- Get customer credit history
-- SELECT * FROM customer_credit_transactions WHERE customer_id = '<customer_id>' ORDER BY created_at DESC;

-- Get sales with split payments
-- SELECT * FROM v_sale_payment_summary WHERE is_split_payment = true;

-- Get customer current balance
-- SELECT * FROM v_customer_credit_balance WHERE customer_id = '<customer_id>';

-- ============================================================================
-- 8. PERMISSIONS (Optional - adjust based on your role system)
-- ============================================================================

-- Grant permissions (adjust role names as needed)
-- GRANT SELECT, INSERT ON payment_methods TO pos_user;
-- GRANT SELECT, INSERT ON sale_payments TO pos_user;
-- GRANT SELECT, INSERT ON customer_credit_transactions TO pos_user;
-- GRANT SELECT ON v_sale_payment_summary TO pos_user;
-- GRANT SELECT ON v_customer_credit_balance TO pos_user;

COMMENT ON TABLE payment_methods IS 'Available payment methods in the system';
COMMENT ON TABLE sale_payments IS 'Individual payment segments for sales (supports split payments)';
COMMENT ON TABLE customer_credit_transactions IS 'Customer credit account transaction history';
COMMENT ON VIEW v_sale_payment_summary IS 'Aggregated payment information per sale';
COMMENT ON VIEW v_customer_credit_balance IS 'Current credit balance per customer';
