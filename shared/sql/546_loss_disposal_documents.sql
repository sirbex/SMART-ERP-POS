-- Migration 546: Loss Disposal Documents (ADR-004 Phase 2C)
--
-- Header for valued write-offs from quarantine (or one-step dispose).
-- Journals stay on ledger_transactions; stock_movements keep economic_event=LOSS_DISPOSAL.

CREATE SEQUENCE IF NOT EXISTS loss_disposal_document_seq START 1;

CREATE TABLE IF NOT EXISTS loss_disposal_documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number         VARCHAR(40) NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'POSTED'
        CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED', 'CANCELLED')),
    reason                  VARCHAR(40) NOT NULL
        CHECK (reason IN ('DAMAGE', 'EXPIRY', 'SHRINKAGE', 'WRITE_OFF', 'PHYSICAL_COUNT')),
    store_location_id       UUID REFERENCES store_locations(id),
    store_type              VARCHAR(20),
    expense_account_code    VARCHAR(20) NOT NULL,
    product_id              UUID NOT NULL REFERENCES products(id),
    product_lot_id          UUID,
    inventory_batch_id      UUID,
    quantity                NUMERIC(15, 4) NOT NULL,
    unit_cost               NUMERIC(15, 4),
    total_amount            NUMERIC(18, 2) NOT NULL DEFAULT 0,
    memo                    TEXT,
    stock_movement_id       UUID,
    journal_entry_id        UUID,
    created_by              UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_at               TIMESTAMPTZ,
    reverses_document_id    UUID REFERENCES loss_disposal_documents(id),
    reversed_by_document_id UUID REFERENCES loss_disposal_documents(id),
    row_version             INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_loss_disposal_documents_number UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_loss_disposal_documents_status
    ON loss_disposal_documents (status);
CREATE INDEX IF NOT EXISTS idx_loss_disposal_documents_store
    ON loss_disposal_documents (store_location_id)
    WHERE store_location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loss_disposal_documents_product
    ON loss_disposal_documents (product_id);

COMMENT ON TABLE loss_disposal_documents IS
  'ADR-004 Phase 2C: LOSS_DISPOSAL header — P&L recognition for quarantined/written-off stock';

INSERT INTO schema_version (version) VALUES (546) ON CONFLICT DO NOTHING;
