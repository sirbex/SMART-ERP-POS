-- Migration 416: Add returns_goods flag to invoices (customer credit notes)
-- When a customer credit note is posted with returns_goods = true,
-- inventory is increased (goods returned from customer) with GL reversal.
-- Backward compatible: default false, existing credit notes unchanged.

-- Add returns_goods column to invoices table (customer CN/DN records)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS returns_goods BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN invoices.returns_goods
  IS 'When TRUE on a CREDIT_NOTE, posting increases inventory (customer returned goods). Default FALSE = financial-only adjustment.';
