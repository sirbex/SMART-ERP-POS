-- Migration 505: Inventory Adjustment Documents
--
-- Creates the inventory_adjustment_documents table.
-- Every batch-level adjustment must reference a document so that audit
-- reports can answer: "Who wrote off this expired stock and why?"
--
-- Architecture notes:
--   - This is a NEW table — no existing schemas are modified.
--   - stock_movements already has reference_type / reference_id columns.
--     Movements created by adjustBatch() will store:
--       reference_type = 'ADJ_DOC'
--       reference_id   = inventory_adjustment_documents.id
--   - document_number format: ADJ-YYYY-#####
--
-- Related code:
--   SamplePOS.Server/src/modules/inventory/inventoryService.ts  (adjustBatch)
--   SamplePOS.Server/src/modules/inventory/inventoryRoutes.ts   (POST /adjust-batch)

CREATE TABLE IF NOT EXISTS inventory_adjustment_documents (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number VARCHAR(50)  UNIQUE NOT NULL,  -- ADJ-YYYY-#####
    reason          VARCHAR(50)  NOT NULL           -- ADJUSTMENT | DAMAGE | EXPIRY | PHYSICAL_COUNT | WRITE_OFF
                    CHECK (reason IN ('ADJUSTMENT', 'DAMAGE', 'EXPIRY', 'PHYSICAL_COUNT', 'WRITE_OFF')),
    notes           TEXT,
    created_by      UUID         NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Lookup by date range (valuation reports, period close)
CREATE INDEX IF NOT EXISTS idx_adj_doc_created_at
    ON inventory_adjustment_documents (created_at);

-- Filter by reason (damage report, expiry report)
CREATE INDEX IF NOT EXISTS idx_adj_doc_reason
    ON inventory_adjustment_documents (reason);

-- Sequence for document numbers (per-year sequential)
CREATE SEQUENCE IF NOT EXISTS adj_doc_seq START 1;

COMMENT ON TABLE inventory_adjustment_documents IS
    'Document header for inventory adjustments. Every batch-level stock change '
    'must reference a document so the audit trail is complete. '
    'See: SamplePOS.Server/src/modules/inventory/inventoryService.ts adjustBatch()';
