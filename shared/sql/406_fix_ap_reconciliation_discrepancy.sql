-- Migration 406: Fix AP reconciliation discrepancy (6 UGX)
-- Root cause: Migration 405 corrected batch BATCH-20260302-004 quantity (4.990→4.992)
--   and Inventory GL matched, but the auto-created supplier invoice SBILL-2026-0003
--   still reflects the old batch amount (4.990 × 3000 = 14,970) instead of the
--   correct GR item amount (4.992 × 3000 = 14,976).
-- This leaves AP GL at 580,006 vs subledger at 580,000 — a 6 UGX discrepancy.
--
-- Fix: Update the supplier invoice to reflect the true GR value (14,976).
--   Since AmountPaid remains 14,970, OutstandingBalance becomes 6.
-- Date: 2026-03-03

BEGIN;

-- ============================================================
-- FIX: Correct supplier invoice SBILL-2026-0003 amounts
-- The GR items for GR-2026-0002 show: 4.9920 × 3000.00 = 14,976.00
-- The invoice was auto-created with 14,970 (from the incorrect batch qty 4.990)
-- ============================================================

-- 1. Update invoice totals to match the actual GR value
UPDATE supplier_invoices
SET "Subtotal" = 14976.000000,
    "TotalAmount" = 14976.000000,
    "OutstandingBalance" = 14976.000000 - "AmountPaid",  -- 14976 - 14970 = 6
    "Status" = CASE
        WHEN "AmountPaid" >= 14976.000000 THEN 'Paid'
        WHEN "AmountPaid" > 0 THEN 'PartiallyPaid'
        ELSE 'Pending'
    END
WHERE "SupplierInvoiceNumber" = 'SBILL-2026-0003'
  AND "TotalAmount" = 14970.000000;

-- 2. Recalculate the supplier's outstanding balance from all their invoices
-- This is safer than hardcoding the delta
UPDATE suppliers s
SET "OutstandingBalance" = (
    SELECT COALESCE(SUM(si."OutstandingBalance"), 0)
    FROM supplier_invoices si
    WHERE si."SupplierId" = s."Id"
      AND si.deleted_at IS NULL
)
WHERE "Id" = (
    SELECT "SupplierId" FROM supplier_invoices
    WHERE "SupplierInvoiceNumber" = 'SBILL-2026-0003'
);

COMMIT;
