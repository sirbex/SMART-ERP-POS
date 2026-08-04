-- Migration 587: Kitchen Production Phase 1 — Production Batch documents (ADR-005)
-- Optional: kitchen_production_enabled DEFAULT FALSE — cook-to-order restaurant unchanged.
-- Inventory SSOT: posts via lot consume/receive + stock_movements; lots use source_type PRODUCTION.

-- ============================================================
-- 1. Feature flag
-- ============================================================
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS kitchen_production_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_settings.kitchen_production_enabled IS
  'ADR-005 Phase 1: when true, Kitchen Production Batch APIs and UI mutations are available';

-- ============================================================
-- 2. Movement types (SAP GI/GR-like material conversion trail)
-- ============================================================
DO $$
BEGIN
  ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'PRODUCTION_ISSUE';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL; -- varchar fallback installs
END $$;

DO $$
BEGIN
  ALTER TYPE movement_type ADD VALUE IF NOT EXISTS 'PRODUCTION_RECEIPT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Refresh ledger signed qty for new movement types (view was migration 054)
CREATE OR REPLACE VIEW inventory_ledger AS
SELECT
  sm.id,
  sm.movement_number,
  sm.product_id,
  sm.batch_id,
  sm.movement_type,
  sm.quantity        AS abs_quantity,
  CASE
    WHEN sm.movement_type::text IN (
      'GOODS_RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN',
      'PRODUCTION_RECEIPT', 'OPENING_BALANCE'
    )
      THEN  sm.quantity
    WHEN sm.movement_type::text IN (
      'SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DAMAGE', 'EXPIRY',
      'PRODUCTION_ISSUE', 'DELIVERY', 'SUPPLIER_RETURN'
    )
      THEN -sm.quantity
    ELSE sm.quantity
  END                AS signed_quantity,
  sm.unit_cost,
  CASE
    WHEN sm.movement_type::text IN (
      'GOODS_RECEIPT', 'ADJUSTMENT_IN', 'TRANSFER_IN', 'RETURN',
      'PRODUCTION_RECEIPT', 'OPENING_BALANCE'
    )
      THEN  sm.quantity * COALESCE(sm.unit_cost, 0)
    WHEN sm.movement_type::text IN (
      'SALE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT', 'DAMAGE', 'EXPIRY',
      'PRODUCTION_ISSUE', 'DELIVERY', 'SUPPLIER_RETURN'
    )
      THEN -sm.quantity * COALESCE(sm.unit_cost, 0)
    ELSE sm.quantity * COALESCE(sm.unit_cost, 0)
  END                AS signed_value,
  sm.reference_type,
  sm.reference_id,
  sm.notes,
  sm.created_by_id,
  sm.created_at      AS movement_date
FROM stock_movements sm;

COMMENT ON VIEW inventory_ledger IS
  'Signed quantity/value over stock_movements (054 + 587 PRODUCTION_* types)';

CREATE OR REPLACE FUNCTION fn_ledger_stock_balance(p_product_id UUID)
RETURNS NUMERIC
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN movement_type::text IN (
        'GOODS_RECEIPT','ADJUSTMENT_IN','TRANSFER_IN','RETURN',
        'PRODUCTION_RECEIPT','OPENING_BALANCE'
      ) THEN quantity
      WHEN movement_type::text IN (
        'SALE','ADJUSTMENT_OUT','TRANSFER_OUT','DAMAGE','EXPIRY',
        'PRODUCTION_ISSUE','DELIVERY','SUPPLIER_RETURN'
      ) THEN -quantity
      ELSE quantity
    END
  ), 0)
  FROM stock_movements
  WHERE product_id = p_product_id;
$$;

-- ============================================================
-- 3. Sequences + documents
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS kitchen_production_document_seq START 1;

CREATE TABLE IF NOT EXISTS kitchen_production_documents (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_number        VARCHAR(40) NOT NULL,
  document_type          VARCHAR(32) NOT NULL DEFAULT 'PRODUCTION_BATCH'
    CHECK (document_type IN ('PRODUCTION_BATCH')),
  production_mode        VARCHAR(32) NOT NULL DEFAULT 'COOK_TO_STOCK'
    CHECK (production_mode IN ('COOK_TO_STOCK')),
  status                 VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'POSTED', 'CANCELLED')),
  production_date        DATE NOT NULL DEFAULT (CURRENT_DATE),
  store_location_id      UUID NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
  output_product_id      UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  output_qty_base        NUMERIC(18, 6) NOT NULL CHECK (output_qty_base > 0),
  output_lot_number      VARCHAR(64) NULL,
  output_inventory_batch_id UUID NULL,
  total_ingredient_cost  NUMERIC(18, 4) NOT NULL DEFAULT 0,
  output_unit_cost       NUMERIC(18, 6) NOT NULL DEFAULT 0,
  notes                  TEXT NULL,
  journal_entry_id       UUID NULL,
  created_by             UUID NOT NULL REFERENCES users(id),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posted_by              UUID NULL REFERENCES users(id),
  posted_at              TIMESTAMPTZ NULL,
  cancelled_at           TIMESTAMPTZ NULL,
  row_version            INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT uq_kitchen_production_documents_number UNIQUE (document_number)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_production_documents_status
  ON kitchen_production_documents (status, production_date DESC);
CREATE INDEX IF NOT EXISTS idx_kitchen_production_documents_output
  ON kitchen_production_documents (output_product_id);
CREATE INDEX IF NOT EXISTS idx_kitchen_production_documents_store
  ON kitchen_production_documents (store_location_id)
  WHERE store_location_id IS NOT NULL;

COMMENT ON TABLE kitchen_production_documents IS
  'ADR-005 Phase 1: Production Batch header — issue ingredients + receive FG (cook-to-stock)';

CREATE TABLE IF NOT EXISTS kitchen_production_component_lines (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id           UUID NOT NULL REFERENCES kitchen_production_documents(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  planned_qty_base      NUMERIC(18, 6) NOT NULL CHECK (planned_qty_base >= 0),
  actual_qty_base       NUMERIC(18, 6) NOT NULL CHECK (actual_qty_base > 0),
  actual_unit_cost      NUMERIC(18, 6) NULL,
  actual_line_cost      NUMERIC(18, 4) NULL,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_kitchen_production_component UNIQUE (document_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_kitchen_production_component_doc
  ON kitchen_production_component_lines (document_id, sort_order);

COMMENT ON TABLE kitchen_production_component_lines IS
  'Components issued on Production Batch post (planned from recipe; actual may differ)';

-- ============================================================
-- 4. RBAC
-- ============================================================
INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES
  ('kitchen.production.read', 'kitchen', 'read', 'View kitchen production batches'),
  ('kitchen.production.create', 'kitchen', 'create', 'Create and edit draft production batches'),
  ('kitchen.production.post', 'kitchen', 'post', 'Post production batches (inventory issue + FG receipt)')
ON CONFLICT (key) DO NOTHING;

-- Admin: all
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, p.key, u.id
FROM rbac_roles r
CROSS JOIN (VALUES
  ('kitchen.production.read'),
  ('kitchen.production.create'),
  ('kitchen.production.post')
) AS p(key)
CROSS JOIN LATERAL (
  SELECT id FROM users ORDER BY created_at NULLS LAST LIMIT 1
) u
WHERE r.name IN ('Administrator', 'Admin', 'Super Admin')
ON CONFLICT DO NOTHING;

-- Manager: all
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, p.key, u.id
FROM rbac_roles r
CROSS JOIN (VALUES
  ('kitchen.production.read'),
  ('kitchen.production.create'),
  ('kitchen.production.post')
) AS p(key)
CROSS JOIN LATERAL (
  SELECT id FROM users ORDER BY created_at NULLS LAST LIMIT 1
) u
WHERE r.name IN ('Manager', 'Store Manager')
ON CONFLICT DO NOTHING;

INSERT INTO schema_version (version) VALUES (587) ON CONFLICT DO NOTHING;
