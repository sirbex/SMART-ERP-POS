-- Canonical MUoM conversion graph
-- Service layer owns graph validation. Database stores only passive invariants.

CREATE TABLE IF NOT EXISTS item_uom_conversions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  from_uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE RESTRICT,
  to_uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE RESTRICT,
  factor NUMERIC(18,6) NOT NULL CHECK (factor >= 1),
  is_canonical BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_item_uom_conversions_distinct_units CHECK (from_uom_id <> to_uom_id),
  CONSTRAINT uq_item_uom_conversions_direction UNIQUE (item_id, from_uom_id, to_uom_id),
  CONSTRAINT uq_item_uom_conversions_single_outgoing UNIQUE (item_id, from_uom_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_item_uom_conversions_reverse_block
ON item_uom_conversions (
  item_id,
  LEAST(from_uom_id::text, to_uom_id::text),
  GREATEST(from_uom_id::text, to_uom_id::text)
);

CREATE INDEX IF NOT EXISTS idx_item_uom_conversions_item_id
ON item_uom_conversions(item_id);

CREATE INDEX IF NOT EXISTS idx_item_uom_conversions_to_uom_id
ON item_uom_conversions(item_id, to_uom_id);

CREATE TABLE IF NOT EXISTS uom_normalization_aliases (
  alias_key VARCHAR(100) PRIMARY KEY,
  canonical_name VARCHAR(100) NOT NULL
);

INSERT INTO uom_normalization_aliases (alias_key, canonical_name)
VALUES
  ('TAB', 'TABLET'),
  ('TABS', 'TABLET'),
  ('TABLETS', 'TABLET'),
  ('PK', 'PACK'),
  ('PKT', 'PACKET'),
  ('PACKS', 'PACK'),
  ('PACKETS', 'PACKET'),
  ('PCS', 'PIECE'),
  ('EA', 'EACH')
ON CONFLICT (alias_key) DO UPDATE
SET canonical_name = EXCLUDED.canonical_name;

CREATE TABLE IF NOT EXISTS uom_conversion_repair_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NULL REFERENCES products(id) ON DELETE SET NULL,
  entity_name VARCHAR(100) NOT NULL,
  entity_id UUID NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);