-- ============================================================================
-- Migration 075: Quotation → Distribution Sales Order link
--
-- Adds the missing back-link from a quotation to the distribution sales order
-- it was converted into (the wholesale conversion path), so:
--
--   * Open Quotations queries can rely on a single convert-once guard regardless
--     of whether the quote was converted retail (sale + invoice) or wholesale (SO).
--   * Reports can join quotations ⇄ dist_sales_orders directly.
--   * The convert-once atomic guard in distService.convertFromQuotation has a
--     concrete FK column to claim instead of leaving converted_to_sale_id NULL
--     while flipping status to CONVERTED (which violated the existing
--     `conversion_complete` CHECK and rendered the wholesale path unusable).
--
-- Why this also adjusts the `conversion_complete` CHECK constraint:
--   The pre-existing constraint required converted_to_sale_id IS NOT NULL when
--   status='CONVERTED'. That made the wholesale path (which has no sale_id)
--   physically impossible. The relaxed CHECK accepts EITHER FK, which is
--   strictly backward compatible — every row that satisfied the old CHECK
--   continues to satisfy the new one.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- 1. Add the FK column (nullable; only set on wholesale conversion path)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS converted_to_so_id UUID
    REFERENCES dist_sales_orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN quotations.converted_to_so_id IS
  'Links to dist_sales_orders.id when a WHOLESALE quotation is converted via distService.convertFromQuotation. Mutually exclusive in practice with converted_to_sale_id (retail path), but the schema permits either FK to satisfy the conversion_complete CHECK.';

-- 2. Relax the conversion_complete CHECK so EITHER FK satisfies it
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS conversion_complete;
ALTER TABLE quotations ADD CONSTRAINT conversion_complete CHECK (
  (
    status = 'CONVERTED'::quotation_status
    AND (converted_to_sale_id IS NOT NULL OR converted_to_so_id IS NOT NULL)
    AND converted_at IS NOT NULL
  )
  OR status <> 'CONVERTED'::quotation_status
);

-- 3. Lookup index for SO → quotation back-traversal
CREATE INDEX IF NOT EXISTS idx_quotations_converted_so
  ON quotations(converted_to_so_id)
  WHERE converted_to_so_id IS NOT NULL;

COMMIT;
