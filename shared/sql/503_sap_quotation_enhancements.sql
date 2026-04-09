-- ============================================================================
-- Migration 503: SAP Quotation System Enhancements
-- Date: 2026-04-09
-- Purpose: Close SAP gaps — item-level status, duplicate prevention,
--          auto-expire support, approval workflow enforcement
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Item-Level Acceptance/Rejection (SAP-style per-line decision)
-- ============================================================================
-- SAP allows accepting some quotation lines and rejecting others.
-- This adds per-item status so wholesale partial fulfillment can
-- respect which lines the customer actually approved.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'quotation_item_status') THEN
    CREATE TYPE quotation_item_status AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');
  END IF;
END $$;

-- Add item_status column with default OPEN
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS item_status quotation_item_status NOT NULL DEFAULT 'OPEN';

-- Add rejection reason per line (SAP: reason for rejection at item level)
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add delivered_quantity tracking if not already present (for partial fulfillment)
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS delivered_quantity NUMERIC(12,4) NOT NULL DEFAULT 0;

-- ============================================================================
-- 2. Duplicate Prevention Index
-- ============================================================================
-- Prevent creating near-identical quotations within a short window.
-- A content hash computed from customer+items serves as idempotency key.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS content_hash VARCHAR(64);

-- Partial unique index: only one OPEN quote with same content hash
-- (allows re-creating after cancellation)
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotations_content_hash_open
  ON quotations (content_hash)
  WHERE content_hash IS NOT NULL
    AND status NOT IN ('CONVERTED', 'CANCELLED');

-- ============================================================================
-- 3. Approval Enforcement Fields
-- ============================================================================
-- SAP checks approval thresholds before quotation can proceed.
-- Add threshold amount so service layer can enforce approval workflow.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS approval_threshold_exceeded BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- 4. Indexes for auto-expire queries
-- ============================================================================
-- Supports efficient batch expire of overdue quotations

CREATE INDEX IF NOT EXISTS idx_quotations_valid_until_status
  ON quotations (valid_until)
  WHERE status NOT IN ('CONVERTED', 'CANCELLED', 'EXPIRED');

-- ============================================================================
-- 5. Verify migration
-- ============================================================================
DO $$ BEGIN
  RAISE NOTICE 'Migration 503: SAP quotation enhancements applied successfully';
END $$;

COMMIT;
