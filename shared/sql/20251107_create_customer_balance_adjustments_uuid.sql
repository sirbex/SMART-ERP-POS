-- Create customer_balance_adjustments table (UUID variant) for environments where customers.id is UUID
-- Date: 2025-11-07

CREATE TABLE IF NOT EXISTS customer_balance_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(15, 2) NOT NULL,  -- Positive = debit (increase balance), Negative = credit (decrease balance)
  reference VARCHAR(100),
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_balance_adjustments_customer_id ON customer_balance_adjustments(customer_id);
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_created_at ON customer_balance_adjustments(created_at);

COMMENT ON TABLE customer_balance_adjustments IS 'Manual adjustments to customer balances (UUID variant)';
COMMENT ON COLUMN customer_balance_adjustments.amount IS 'Positive values increase balance (debit), negative values decrease balance (credit)';
