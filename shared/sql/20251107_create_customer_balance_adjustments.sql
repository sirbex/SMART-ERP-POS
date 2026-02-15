-- Create customer_balance_adjustments table for manual balance adjustments
-- Date: 2025-11-07

CREATE TABLE IF NOT EXISTS customer_balance_adjustments (
  id VARCHAR(50) PRIMARY KEY DEFAULT ('adj_' || substr(md5(random()::text || clock_timestamp()::text), 1, 24)),
  customer_id VARCHAR(50) NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL,  -- Positive = debit (increase balance), Negative = credit (decrease balance)
  reference VARCHAR(100),
  description TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster customer lookups
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_customer_id ON customer_balance_adjustments(customer_id);

-- Index for date-based queries
CREATE INDEX IF NOT EXISTS idx_balance_adjustments_created_at ON customer_balance_adjustments(created_at);

-- Add comment
COMMENT ON TABLE customer_balance_adjustments IS 'Manual adjustments to customer balances (e.g., credits, write-offs, corrections)';
COMMENT ON COLUMN customer_balance_adjustments.amount IS 'Positive values increase balance (debit), negative values decrease balance (credit)';
