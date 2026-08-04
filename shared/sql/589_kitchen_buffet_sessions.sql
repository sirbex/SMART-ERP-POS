-- Migration 589: Kitchen Production Phase 3 — Buffet Session capacity documents (ADR-005)
-- Buffet is NOT a recipe: session tracks covers + prepared dish targets.
-- Cover sales increment sold_covers; ingredients already issued via production batches.

CREATE SEQUENCE IF NOT EXISTS kitchen_buffet_session_seq START 1;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS is_buffet_cover BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_products_is_buffet_cover
  ON products (is_buffet_cover)
  WHERE is_buffet_cover = TRUE;

COMMENT ON COLUMN products.is_buffet_cover IS
  'Phase 3: service (or stockless) product sold as buffet plate/cover capacity. '
  'Sale attaches to an OPEN kitchen_buffet_sessions row; does not explode ingredients.';

CREATE TABLE IF NOT EXISTS kitchen_buffet_sessions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number       VARCHAR(40) NOT NULL,
  name                  VARCHAR(160) NOT NULL,
  service_date          DATE NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED')),
  cover_product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  expected_covers       NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (expected_covers >= 0),
  sold_covers           NUMERIC(18, 4) NOT NULL DEFAULT 0 CHECK (sold_covers >= 0),
  allow_overbook        BOOLEAN NOT NULL DEFAULT TRUE,
  store_location_id     UUID NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  notes                 TEXT NULL,
  created_by            UUID NOT NULL REFERENCES users(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by             UUID NULL REFERENCES users(id),
  opened_at             TIMESTAMPTZ NULL,
  closed_by             UUID NULL REFERENCES users(id),
  closed_at             TIMESTAMPTZ NULL,
  cancelled_at          TIMESTAMPTZ NULL,
  row_version           INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_kitchen_buffet_sessions_number UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_buffet_sessions_status_date
  ON kitchen_buffet_sessions (status, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_buffet_sessions_cover
  ON kitchen_buffet_sessions (cover_product_id, service_date);

COMMENT ON TABLE kitchen_buffet_sessions IS
  'ADR-005 Phase 3: buffet/catering service period — capacity (covers), not ingredient BOM';

CREATE TABLE IF NOT EXISTS kitchen_buffet_session_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id            UUID NOT NULL REFERENCES kitchen_buffet_sessions(id) ON DELETE CASCADE,
  prepared_product_id   UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  planned_qty_base      NUMERIC(18, 6) NOT NULL CHECK (planned_qty_base >= 0),
  -- Phase 3: operational plan for prepared FG availability (not auto-issued at open)
  unit_label            VARCHAR(40) NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  notes                 TEXT NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kitchen_buffet_session_line UNIQUE (session_id, prepared_product_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_buffet_session_lines_session
  ON kitchen_buffet_session_lines (session_id, sort_order);

COMMENT ON TABLE kitchen_buffet_session_lines IS
  'Prepared dish targets for a buffet session (portions). Stock already in FG via production batches.';

CREATE TABLE IF NOT EXISTS kitchen_buffet_cover_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id        UUID NOT NULL REFERENCES kitchen_buffet_sessions(id) ON DELETE CASCADE,
  sale_id           UUID NULL,
  covers            NUMERIC(18, 4) NOT NULL CHECK (covers > 0),
  cover_product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_buffet_cover_ledger_session
  ON kitchen_buffet_cover_ledger (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_buffet_cover_ledger_sale
  ON kitchen_buffet_cover_ledger (sale_id)
  WHERE sale_id IS NOT NULL;

COMMENT ON TABLE kitchen_buffet_cover_ledger IS
  'Audit of covers sold against OPEN buffet sessions (createSale).';

INSERT INTO schema_version (version) VALUES (589) ON CONFLICT DO NOTHING;
