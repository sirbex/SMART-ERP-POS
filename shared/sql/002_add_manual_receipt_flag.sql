-- Migration: Add manual_receipt flag to purchase_orders
-- Purpose: Distinguish auto-generated POs (from manual GRs) from regular POs
-- Date: 2025-11-01

-- Add manual_receipt column to purchase_orders
ALTER TABLE purchase_orders 
ADD COLUMN IF NOT EXISTS manual_receipt BOOLEAN DEFAULT false;

-- Add index for filtering manual vs regular POs
CREATE INDEX IF NOT EXISTS idx_po_manual_receipt ON purchase_orders(manual_receipt);

-- Add comment for documentation
COMMENT ON COLUMN purchase_orders.manual_receipt IS 
'Indicates if this PO was auto-generated from a manual goods receipt. True = auto-generated, False = regular PO created by user.';
