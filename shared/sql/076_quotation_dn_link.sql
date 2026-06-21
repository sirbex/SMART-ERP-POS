-- ============================================================================
-- Migration 076 — Quotation → Delivery Note conversion link
-- ============================================================================
-- Closes the "ghost open quotation" loophole for the WHOLESALE → Delivery Note
-- (legacy) path. Mirrors migration 075 which added converted_to_so_id for the
-- Distribution module's Sales Order path.
--
-- Why a FK to the FIRST delivery note (not "all DNs"):
--   A wholesale quote produces 1..N delivery notes (partial deliveries). The
--   conversion EVENT — the moment the quote stops being "open" and starts
--   being "in fulfilment" — is the creation of the FIRST DN. The FK is a
--   representative trace for that event, matching SAP's "first reference
--   document" pattern. Subsequent DNs are allowed by relaxing the DN service's
--   terminal-status check to permit CONVERTED quotes that were claimed via
--   this column.
--
-- Why the CHECK is RELAXED (not tightened):
--   Every row that satisfied the old constraint still satisfies the new one.
--   We only add a third allowed FK; we never require it. This is a strictly
--   backward-compatible widening — existing data, existing reports, existing
--   API responses are unaffected.
--
-- Backward compatibility:
--   - All existing quotations have converted_to_dn_id = NULL.
--   - All existing DN creation code paths continue to compile and run.
--   - The atomic claim is a new optional call site; if the application is
--     rolled back, the column simply stays NULL and the system reverts to
--     the pre-076 behaviour (DN created, quote not marked CONVERTED — the
--     bug we are fixing, not a crash).
--
-- ON DELETE SET NULL:
--   Hard-deleting a DN (rare; we soft-delete in service) clears the
--   representative pointer but leaves the quote CONVERTED. That is the
--   conservative choice — once a delivery has been dispatched against a
--   quote, the quote should not silently re-open.
-- ============================================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS converted_to_dn_id UUID
  REFERENCES delivery_notes(id) ON DELETE SET NULL;

-- Recreate conversion_complete CHECK with the new 3-way OR.
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS conversion_complete;
ALTER TABLE quotations ADD CONSTRAINT conversion_complete CHECK (
  (status = 'CONVERTED'::quotation_status
    AND (converted_to_sale_id IS NOT NULL
         OR converted_to_so_id IS NOT NULL
         OR converted_to_dn_id IS NOT NULL)
    AND converted_at IS NOT NULL)
  OR status <> 'CONVERTED'::quotation_status
);

CREATE INDEX IF NOT EXISTS idx_quotations_converted_dn
  ON quotations(converted_to_dn_id)
  WHERE converted_to_dn_id IS NOT NULL;

COMMENT ON COLUMN quotations.converted_to_dn_id IS
  'FK to the first Delivery Note created from this wholesale quotation. '
  'Set atomically by deliveryNoteService.createDeliveryNote via '
  'markQuotationAsConvertedToFirstDN. Subsequent DNs do not change this '
  'value. NULL means no DN-driven conversion has occurred.';
