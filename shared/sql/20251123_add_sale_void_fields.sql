-- Migration: Add Sale Void/Cancellation Fields
-- Date: 2025-11-23
-- Purpose: Support sale void/cancellation with manager approval and audit trail
-- Reference: POS_SYSTEM_ASSESSMENT.md - Critical Loophole #1

-- Add void tracking fields to sales table
ALTER TABLE sales 
  ADD COLUMN IF NOT EXISTS voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS voided_by_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS void_reason TEXT,
  ADD COLUMN IF NOT EXISTS void_approved_by_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS void_approved_at TIMESTAMPTZ;

-- Add indexes for void queries
CREATE INDEX IF NOT EXISTS idx_sales_voided_at ON sales(voided_at) WHERE voided_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_voided_by ON sales(voided_by_id) WHERE voided_by_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);

-- Add comments for documentation
COMMENT ON COLUMN sales.voided_at IS 'Timestamp when sale was voided';
COMMENT ON COLUMN sales.voided_by_id IS 'User who initiated the void request';
COMMENT ON COLUMN sales.void_reason IS 'Required reason for voiding the sale';
COMMENT ON COLUMN sales.void_approved_by_id IS 'Manager who approved the void (if required)';
COMMENT ON COLUMN sales.void_approved_at IS 'Timestamp when void was approved';

-- Note: sale_status enum already supports 'VOID' and 'REFUNDED' values
-- Status transitions: COMPLETED -> VOID (with manager approval)
-- Inventory restoration must be handled in application logic
