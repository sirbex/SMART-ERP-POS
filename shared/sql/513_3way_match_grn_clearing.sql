-- ============================================================================
-- Migration 513: 3-Way Match — GRN/IR Clearing (SAP/Odoo Architecture)
-- ============================================================================
-- SYSTEM RULE (not tenant-specific):
--   GRN must NEVER create Accounts Payable (2100).
--   Only a Supplier Invoice (Bill) can create Accounts Payable.
--
-- New posting flow:
--   GRN finalization:    DR Inventory (1300) / CR GRN Clearing (2150)
--   Supplier Invoice:    DR GRN Clearing (2150) / CR Accounts Payable (2100)
--   Supplier Payment:    DR Accounts Payable (2100) / CR Cash/Bank
--
-- This migration:
--   1. Adds is_posted_to_gl + posted_to_gl_at columns to supplier_invoices
--   2. Creates supplier_invoice_grn_links junction table
--   3. Backfills links for existing auto-created invoices
--   4. Marks existing invoices as gl_posted (their AP was created via old GRN GL flow)
--   5. Updates account 2150 (GRIR_CLEARING) AllowedSources to accept INVENTORY_MOVE + PURCHASE_BILL
--   6. Drops the trigger on supplier_invoices (violates no-triggers architecture rule)
-- ============================================================================

BEGIN;

-- ─── 1. Add GL tracking columns to supplier_invoices ─────────────────────────
ALTER TABLE supplier_invoices
  ADD COLUMN IF NOT EXISTS is_posted_to_gl BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS posted_to_gl_at TIMESTAMPTZ;

-- ─── 2. Create GRN ↔ Invoice junction table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_invoice_grn_links (
  invoice_id UUID NOT NULL REFERENCES supplier_invoices("Id") ON DELETE CASCADE,
  grn_id     UUID NOT NULL REFERENCES goods_receipts(id)      ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (invoice_id, grn_id)
);

CREATE INDEX IF NOT EXISTS idx_sigl_invoice_id ON supplier_invoice_grn_links(invoice_id);
CREATE INDEX IF NOT EXISTS idx_sigl_grn_id     ON supplier_invoice_grn_links(grn_id);

-- ─── 3. Backfill junction table for existing auto-created invoices ────────────
-- Auto-created invoices used the GR receipt_number as InternalReferenceNumber
INSERT INTO supplier_invoice_grn_links (invoice_id, grn_id)
SELECT si."Id", gr.id
FROM supplier_invoices si
JOIN goods_receipts gr
  ON gr.receipt_number = si."InternalReferenceNumber"
WHERE si.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM supplier_invoice_grn_links l
    WHERE l.invoice_id = si."Id" AND l.grn_id = gr.id
  )
ON CONFLICT DO NOTHING;

-- Also handle the fallback: InternalReferenceNumber = GR UUID (edge case)
INSERT INTO supplier_invoice_grn_links (invoice_id, grn_id)
SELECT si."Id", gr.id
FROM supplier_invoices si
JOIN goods_receipts gr
  ON gr.id::text = si."InternalReferenceNumber"
WHERE si.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM supplier_invoice_grn_links l
    WHERE l.invoice_id = si."Id" AND l.grn_id = gr.id
  )
ON CONFLICT DO NOTHING;

-- ─── 4. Mark all existing invoices as posted to GL ──────────────────────────
-- Historical invoices were created via GRN auto-flow which posted directly to
-- AP (2100). The GL liability was created — just via the wrong referenceType.
-- Marking them posted_to_gl=true ensures they are not re-posted under the new
-- SUPPLIER_INVOICE flow (which would double-count AP).
UPDATE supplier_invoices
SET is_posted_to_gl = TRUE,
    posted_to_gl_at = COALESCE("CreatedAt", NOW())
WHERE is_posted_to_gl = FALSE
  AND deleted_at IS NULL;

-- ─── 5. Update account 2150 (GRIR_CLEARING) AllowedSources ──────────────────
-- 2150 must accept:
--   INVENTORY_MOVE  — GRN posts DR Inventory / CR GRN Clearing
--   PURCHASE_BILL   — Invoice clears DR GRN Clearing / CR AP
--   SYSTEM_CORRECTION — Admin remediation
UPDATE accounts
SET "AllowedSources" = ARRAY['INVENTORY_MOVE', 'PURCHASE_BILL', 'SYSTEM_CORRECTION']::text[]
WHERE "AccountCode" = '2150';

-- ─── 6. Drop the trigger on supplier_invoices (violates no-triggers rule) ────
-- Status transitions are managed by supplierPaymentService.updateInvoicePaidAmount()
DROP TRIGGER IF EXISTS trg_update_supplier_invoice_status ON supplier_invoices;
DROP FUNCTION IF EXISTS fn_update_supplier_invoice_status() CASCADE;

-- ─── 7. Schema version ───────────────────────────────────────────────────────
INSERT INTO schema_version (version, applied_at)
SELECT 513, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 513);

COMMIT;
