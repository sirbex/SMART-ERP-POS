-- Migration 551: Bad Debt AR Write-off Documents (ADR-006 Phase 4B)
--
-- Header + allocation lines for direct write-off: DR 5210 / CR 1200.
-- Settlement SSOT (getInvoiceSettlement) sums posted write-off lines into amount_paid.
-- Related: docs/architecture/BAD_DEBT_ADR.md

CREATE SEQUENCE IF NOT EXISTS ar_writeoff_document_seq START 1;

CREATE TABLE IF NOT EXISTS ar_writeoff_documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_number         VARCHAR(40) NOT NULL,
    status                  VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CHECK (status IN ('DRAFT', 'PENDING_APPROVAL', 'POSTED', 'CANCELLED')),
    customer_id             UUID NOT NULL REFERENCES customers(id),
    writeoff_date           DATE NOT NULL,
    reason_code             VARCHAR(40) NOT NULL
        CHECK (reason_code IN ('UNCOLLECTIBLE', 'DISPUTE_LOST', 'BANKRUPTCY', 'OTHER')),
    expense_account_code    VARCHAR(20) NOT NULL DEFAULT '5210',
    total_amount            NUMERIC(18, 2) NOT NULL DEFAULT 0,
    memo                    TEXT,
    journal_entry_id        UUID,
    created_by              UUID NOT NULL REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    posted_at               TIMESTAMPTZ,
    approved_by             UUID REFERENCES users(id),
    approved_at             TIMESTAMPTZ,
    reverses_document_id    UUID REFERENCES ar_writeoff_documents(id),
    reversed_by_document_id UUID REFERENCES ar_writeoff_documents(id),
    row_version             INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT uq_ar_writeoff_documents_number UNIQUE (document_number)
);

CREATE TABLE IF NOT EXISTS ar_writeoff_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writeoff_document_id    UUID NOT NULL REFERENCES ar_writeoff_documents(id) ON DELETE CASCADE,
    line_number             INTEGER NOT NULL,
    invoice_id              UUID NOT NULL REFERENCES invoices(id),
    open_amount_before      NUMERIC(18, 2) NOT NULL DEFAULT 0,
    writeoff_amount         NUMERIC(18, 2) NOT NULL
        CHECK (writeoff_amount > 0),
    memo                    TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_ar_writeoff_lines_doc_line UNIQUE (writeoff_document_id, line_number)
);

CREATE TABLE IF NOT EXISTS ar_writeoff_audit (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    writeoff_document_id    UUID NOT NULL REFERENCES ar_writeoff_documents(id) ON DELETE CASCADE,
    event_type              VARCHAR(40) NOT NULL,
    actor_user_id           UUID REFERENCES users(id),
    payload_json            JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ar_writeoff_documents_customer
    ON ar_writeoff_documents (customer_id);
CREATE INDEX IF NOT EXISTS idx_ar_writeoff_documents_status
    ON ar_writeoff_documents (status);
CREATE INDEX IF NOT EXISTS idx_ar_writeoff_lines_invoice
    ON ar_writeoff_lines (invoice_id);
CREATE INDEX IF NOT EXISTS idx_ar_writeoff_lines_doc
    ON ar_writeoff_lines (writeoff_document_id);

COMMENT ON TABLE ar_writeoff_documents IS
  'ADR-006 Phase 4B: Bad Debt / AR write-off header — DR Bad Debt Expense / CR AR';
COMMENT ON TABLE ar_writeoff_lines IS
  'ADR-006: invoice allocations for AR write-off; counted in invoice settlement when POSTED and not reversed';

INSERT INTO schema_version (version) VALUES (551) ON CONFLICT DO NOTHING;
