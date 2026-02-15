-- Migration: Allow zero amount in payment_lines for full credit sales
-- Date: 2025-11-23
-- Description: Updates payment_lines.amount constraint to allow >= 0 instead of > 0
--              This enables full credit sales where amount = 0 and entire balance goes to invoice

-- Drop the old constraint that required amount > 0
ALTER TABLE payment_lines 
DROP CONSTRAINT IF EXISTS payment_lines_amount_check;

-- Add new constraint allowing amount >= 0 (zero for full credit sales)
ALTER TABLE payment_lines 
ADD CONSTRAINT payment_lines_amount_check CHECK (amount >= 0);

-- Rationale:
-- For full credit sales, we need to record a CREDIT payment line with amount = 0
-- to indicate that the entire sale amount is on credit (accounts receivable)
-- This allows proper tracking of payment methods even when no immediate payment is made
