-- Migration 525: Multi-Store Warehouse Network — foundation (Phase 2)
--
-- Creates store classification, product lot identity, and composite store×lot
-- inventory balances for multistore mode.
--
-- Backward compatibility:
--   • Legacy per-product state table inventory_balances (306) is renamed to
--     inventory_aggregate_balances — unchanged semantics for single-store tenants.
--   • New inventory_balances is the composite layer (store × lot × qty).
--   • system_settings.is_multistore_enabled defaults FALSE — no behaviour change
--     until Service Layer enables multistore paths (Phase 5+).
--
-- Related types: shared/types/warehouseNetwork.ts
-- Related settings: shared/types/systemSettings.ts (isMultistoreEnabled)

-- ============================================================
-- 1. store_type ENUM
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_type') THEN
        CREATE TYPE store_type AS ENUM (
            'MAIN',
            'SELLING',
            'TRANSIT',
            'DAMAGE',
            'EXPIRED',
            'RETURN'
        );
    END IF;
END $$;

-- ============================================================
-- 2. store_locations — physical/logical stores per tenant
-- ============================================================
CREATE TABLE IF NOT EXISTS store_locations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                    VARCHAR(50)  NOT NULL,
    name                    VARCHAR(255) NOT NULL,
    store_type              store_type   NOT NULL,
    is_active               BOOLEAN      NOT NULL DEFAULT true,
    is_default_receiving    BOOLEAN      NOT NULL DEFAULT false,
    is_pos_selling          BOOLEAN      NOT NULL DEFAULT false,
    parent_store_id         UUID         REFERENCES store_locations(id) ON DELETE SET NULL,
    notes                   TEXT,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_locations_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_store_locations_type
    ON store_locations (store_type);

CREATE INDEX IF NOT EXISTS idx_store_locations_active
    ON store_locations (is_active)
    WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_store_locations_pos_selling
    ON store_locations (is_pos_selling)
    WHERE is_pos_selling = true;

COMMENT ON TABLE store_locations IS
    'Warehouse/store network nodes (MAIN, SELLING, TRANSIT, etc.). Used when is_multistore_enabled = true.';

-- ============================================================
-- 3. product_lots — canonical lot identity (product × lot × expiry × cost)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_lots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID           NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    lot_number          VARCHAR(100)   NOT NULL,
    expiry_date         DATE,
    cost_price          NUMERIC(15, 4) NOT NULL,
    received_date       TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    status              VARCHAR(20)    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'DEPLETED', 'EXPIRED', 'QUARANTINED', 'BLOCKED')),
    goods_receipt_id    UUID           REFERENCES goods_receipts(id) ON DELETE SET NULL,
    inventory_batch_id  UUID           REFERENCES inventory_batches(id) ON DELETE SET NULL,
    is_bonus            BOOLEAN        NOT NULL DEFAULT false,
    notes               TEXT,
    created_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_product_lots_product_lot UNIQUE (product_id, lot_number)
);

CREATE INDEX IF NOT EXISTS idx_product_lots_product
    ON product_lots (product_id);

CREATE INDEX IF NOT EXISTS idx_product_lots_fefo
    ON product_lots (product_id, expiry_date ASC NULLS LAST, received_date ASC);

CREATE INDEX IF NOT EXISTS idx_product_lots_status
    ON product_lots (status)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_product_lots_expiry
    ON product_lots (expiry_date)
    WHERE expiry_date IS NOT NULL;

COMMENT ON TABLE product_lots IS
    'Canonical lot master for multistore inventory. inventory_batch_id bridges legacy single-store batches.';

-- ============================================================
-- 4. inventory_balances — composite store × lot available qty
--    Rename legacy per-product state table first (306).
-- ============================================================
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'inventory_balances'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'inventory_balances'
          AND column_name = 'store_location_id'
    ) THEN
        ALTER TABLE inventory_balances RENAME TO inventory_aggregate_balances;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS inventory_balances (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_location_id       UUID           NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
    product_id              UUID           NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    product_lot_id          UUID           NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
    quantity_on_hand        NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_reserved       NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_damaged        NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_expired        NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_incoming       NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_transfer_in    NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_transfer_out   NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_committed      NUMERIC(15, 4) NOT NULL DEFAULT 0,
    blocked                 BOOLEAN        NOT NULL DEFAULT false,
    updated_at              TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_inventory_balances_store_lot UNIQUE (store_location_id, product_lot_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_store_active_qty
    ON inventory_balances (store_location_id)
    WHERE quantity_on_hand > 0;

CREATE INDEX IF NOT EXISTS idx_inventory_balances_product
    ON inventory_balances (product_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_lot
    ON inventory_balances (product_lot_id);

CREATE INDEX IF NOT EXISTS idx_inventory_balances_store_product
    ON inventory_balances (store_location_id, product_id);

COMMENT ON TABLE inventory_balances IS
    'Composite multistore inventory layer: available qty per store × product lot. '
    'Legacy per-product aggregate state lives in inventory_aggregate_balances (306).';

-- ============================================================
-- 5. Tenant settings — multistore feature flag
-- ============================================================
ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS is_multistore_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN system_settings.is_multistore_enabled IS
    'When true, Service Layer uses composite store×lot inventory (inventory_balances). '
    'When false (default), system behaves as single-store legacy architecture.';

-- ============================================================
-- 6. Optional FK: stock_counts.location_id → store_locations
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'fk_stock_counts_location'
          AND table_name = 'stock_counts'
    ) THEN
        ALTER TABLE stock_counts
            ADD CONSTRAINT fk_stock_counts_location
            FOREIGN KEY (location_id) REFERENCES store_locations(id) ON DELETE SET NULL;
    END IF;
EXCEPTION
    WHEN undefined_table THEN
        NULL; -- stock_counts may not exist on very old schemas
END $$;

INSERT INTO schema_version (version) VALUES (525) ON CONFLICT DO NOTHING;
