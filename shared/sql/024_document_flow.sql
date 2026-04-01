-- ============================================================
-- Document Flow (SAP Document Flow / Odoo Smart Buttons pattern)
-- Generic graph linking ANY document to ANY document.
-- No foreign keys — universal by design.
-- ============================================================

CREATE TABLE IF NOT EXISTS document_flow (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    from_entity_type TEXT NOT NULL,   -- QUOTATION, SALE, INVOICE, etc.
    from_entity_id   UUID NOT NULL,

    to_entity_type   TEXT NOT NULL,
    to_entity_id     UUID NOT NULL,

    relation_type    TEXT NOT NULL,   -- CREATED_FROM, FULFILLS, ADJUSTS, RETURNS, PAYS

    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (from_entity_type, from_entity_id, to_entity_type, to_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_df_from ON document_flow (from_entity_type, from_entity_id);
CREATE INDEX IF NOT EXISTS idx_df_to   ON document_flow (to_entity_type, to_entity_id);

COMMENT ON TABLE  document_flow IS 'Generic document-to-document link graph (SAP Document Flow pattern)';
COMMENT ON COLUMN document_flow.relation_type IS 'CREATED_FROM | FULFILLS | ADJUSTS | RETURNS | PAYS';
