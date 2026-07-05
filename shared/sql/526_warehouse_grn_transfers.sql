-- Migration 526: GRN target stores + two-step store transfer protocol (Phase 7 & 8)
--
-- GRN lines may specify target_store_location_id (defaults to MAIN at service layer).
-- store_transfers: MAIN → TRANSIT (dispatch) → SELLING (receive).

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'store_transfer_status') THEN
        CREATE TYPE store_transfer_status AS ENUM (
            'DRAFT',
            'APPROVED',
            'DISPATCHED',
            'IN_TRANSIT',
            'RECEIVED',
            'CANCELLED'
        );
    END IF;
END $$;

ALTER TABLE goods_receipt_items
    ADD COLUMN IF NOT EXISTS target_store_location_id UUID
        REFERENCES store_locations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_gr_items_target_store
    ON goods_receipt_items (target_store_location_id)
    WHERE target_store_location_id IS NOT NULL;

COMMENT ON COLUMN goods_receipt_items.target_store_location_id IS
    'Multistore GRN: receiving store (defaults to MAIN when is_multistore_enabled).';

CREATE TABLE IF NOT EXISTS store_transfers (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transfer_number         VARCHAR(50) NOT NULL,
    status                  store_transfer_status NOT NULL DEFAULT 'DRAFT',
    source_store_id         UUID NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
    transit_store_id        UUID NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
    destination_store_id    UUID NOT NULL REFERENCES store_locations(id) ON DELETE RESTRICT,
    notes                   TEXT,
    created_by_id           UUID REFERENCES users(id) ON DELETE SET NULL,
    approved_by_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    dispatched_by_id        UUID REFERENCES users(id) ON DELETE SET NULL,
    received_by_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at             TIMESTAMPTZ,
    dispatched_at           TIMESTAMPTZ,
    received_at             TIMESTAMPTZ,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_transfers_number UNIQUE (transfer_number)
);

CREATE INDEX IF NOT EXISTS idx_store_transfers_status
    ON store_transfers (status);

CREATE INDEX IF NOT EXISTS idx_store_transfers_source
    ON store_transfers (source_store_id);

CREATE TABLE IF NOT EXISTS store_transfer_lines (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_transfer_id       UUID NOT NULL REFERENCES store_transfers(id) ON DELETE CASCADE,
    line_number             INTEGER NOT NULL,
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    product_lot_id          UUID NOT NULL REFERENCES product_lots(id) ON DELETE RESTRICT,
    quantity                NUMERIC(15, 4) NOT NULL CHECK (quantity > 0),
    quantity_dispatched     NUMERIC(15, 4) NOT NULL DEFAULT 0,
    quantity_received       NUMERIC(15, 4) NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_store_transfer_line UNIQUE (store_transfer_id, line_number),
    CONSTRAINT chk_transfer_line_qty CHECK (
        quantity_dispatched >= 0 AND quantity_received >= 0
        AND quantity_dispatched <= quantity
        AND quantity_received <= quantity_dispatched
    )
);

CREATE INDEX IF NOT EXISTS idx_store_transfer_lines_transfer
    ON store_transfer_lines (store_transfer_id);

CREATE INDEX IF NOT EXISTS idx_store_transfer_lines_lot
    ON store_transfer_lines (product_lot_id);

COMMENT ON TABLE store_transfers IS
    'Two-step inter-store transfer: dispatch MAIN→TRANSIT, receive TRANSIT→SELLING.';

INSERT INTO schema_version (version) VALUES (526) ON CONFLICT DO NOTHING;
