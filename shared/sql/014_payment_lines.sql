-- ============================================================================
-- Migration: 014_payment_lines.sql
-- Description: Add payment_lines table for split payment support
-- Date: 2025-11-22
-- ============================================================================

-- Table: payment_lines
-- Stores individual payment segments for each sale (split payment support)
CREATE TABLE IF NOT EXISTS payment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_payment_lines_sale_id ON payment_lines(sale_id);
CREATE INDEX IF NOT EXISTS idx_payment_lines_payment_method ON payment_lines(payment_method);
CREATE INDEX IF NOT EXISTS idx_payment_lines_created_at ON payment_lines(created_at);

-- Comments
COMMENT ON TABLE payment_lines IS 'Individual payment segments for split payments - allows a single sale to be paid using multiple payment methods';
COMMENT ON COLUMN payment_lines.sale_id IS 'Foreign key to sales table';
COMMENT ON COLUMN payment_lines.payment_method IS 'Payment method used: CASH, CARD, MOBILE_MONEY, or CREDIT';
COMMENT ON COLUMN payment_lines.amount IS 'Amount paid using this payment method';
COMMENT ON COLUMN payment_lines.reference IS 'Reference number for card/mobile money transactions';
COMMENT ON COLUMN payment_lines.created_at IS 'Timestamp when payment line was created';

-- View: sale_payment_summary
-- Aggregates payment lines per sale for reporting
CREATE OR REPLACE VIEW v_sale_payment_summary AS
SELECT 
  s.id AS sale_id,
  s.sale_number,
  s.total_amount,
  COUNT(pl.id) AS payment_count,
  SUM(pl.amount) AS total_paid,
  s.total_amount - COALESCE(SUM(pl.amount), 0) AS balance_remaining,
  ARRAY_AGG(
    JSON_BUILD_OBJECT(
      'method', pl.payment_method,
      'amount', pl.amount,
      'reference', pl.reference
    ) ORDER BY pl.created_at
  ) FILTER (WHERE pl.id IS NOT NULL) AS payment_lines
FROM sales s
LEFT JOIN payment_lines pl ON pl.sale_id = s.id
GROUP BY s.id, s.sale_number, s.total_amount;

COMMENT ON VIEW v_sale_payment_summary IS 'Aggregates payment lines per sale with payment count and total paid';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
