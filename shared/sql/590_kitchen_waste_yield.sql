-- Migration 590: Kitchen Production Phase 4 — Waste / yield documents (ADR-005)
-- Posts into Inventory Engine (lot consume + stock_movements + DR 5110|5120|5130 / CR 1300).
-- Buffet session close can link leftovers via kitchen_waste_documents.buffet_session_id.

CREATE SEQUENCE IF NOT EXISTS kitchen_waste_document_seq START 1;

CREATE TABLE IF NOT EXISTS kitchen_waste_documents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number         VARCHAR(40) NOT NULL,
  document_type           VARCHAR(32) NOT NULL DEFAULT 'WASTE_YIELD'
    CHECK (document_type IN ('WASTE_YIELD', 'CLOSING')),
  status                  VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  waste_date              DATE NOT NULL DEFAULT (CURRENT_DATE),
  reason                  VARCHAR(32) NOT NULL DEFAULT 'LEFTOVER'
    CHECK (reason IN (
      'COOKING_LOSS', 'LEFTOVER', 'STAFF_MEAL', 'SPOILAGE', 'OVERPRODUCTION', 'OTHER'
    )),
  -- ADR-004 expense classifier used at post
  loss_expense_reason     VARCHAR(32) NOT NULL DEFAULT 'SHRINKAGE'
    CHECK (loss_expense_reason IN ('SHRINKAGE', 'DAMAGE', 'EXPIRY', 'WRITE_OFF')),
  expense_account_code    VARCHAR(20) NULL,
  store_location_id       UUID NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  buffet_session_id       UUID NULL REFERENCES kitchen_buffet_sessions(id) ON DELETE SET NULL,
  production_document_id  UUID NULL REFERENCES kitchen_production_documents(id) ON DELETE SET NULL,
  notes                   TEXT NULL,
  total_cost              NUMERIC(18, 4) NOT NULL DEFAULT 0,
  journal_entry_id        UUID NULL,
  created_by              UUID NOT NULL REFERENCES users(id),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by               UUID NULL REFERENCES users(id),
  posted_at               TIMESTAMPTZ NULL,
  cancelled_at            TIMESTAMPTZ NULL,
  row_version             INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_kitchen_waste_documents_number UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_waste_documents_status
  ON kitchen_waste_documents (status, waste_date DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_waste_documents_session
  ON kitchen_waste_documents (buffet_session_id)
  WHERE buffet_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_kitchen_waste_documents_production
  ON kitchen_waste_documents (production_document_id)
  WHERE production_document_id IS NOT NULL;

COMMENT ON TABLE kitchen_waste_documents IS
  'ADR-005 Phase 4: kitchen waste/yield — inventory write-off of prepared food or ingredients';

CREATE TABLE IF NOT EXISTS kitchen_waste_lines (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID NOT NULL REFERENCES kitchen_waste_documents(id) ON DELETE CASCADE,
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  planned_qty_base  NUMERIC(18, 6) NOT NULL DEFAULT 0 CHECK (planned_qty_base >= 0),
  qty_base          NUMERIC(18, 6) NOT NULL CHECK (qty_base > 0),
  actual_unit_cost  NUMERIC(18, 6) NULL,
  actual_line_cost  NUMERIC(18, 4) NULL,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  notes             TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kitchen_waste_line UNIQUE (document_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_waste_lines_doc
  ON kitchen_waste_lines (document_id, sort_order);

COMMENT ON TABLE kitchen_waste_lines IS
  'Products written off on kitchen waste/yield post (FEFO consume)';

COMMENT ON COLUMN kitchen_waste_documents.document_type IS
  'WASTE_YIELD = ad-hoc kitchen loss; CLOSING = end-of-session leftover recon (may link buffet session)';

INSERT INTO schema_version (version) VALUES (590) ON CONFLICT DO NOTHING;
