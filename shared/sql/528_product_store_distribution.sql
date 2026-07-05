-- Migration 528: Product store distribution policy (Phase 2)
-- GLOBAL = assortment in all selling locations; RESTRICTED = explicit store assignments.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'product_distribution_policy') THEN
        CREATE TYPE product_distribution_policy AS ENUM ('GLOBAL', 'RESTRICTED');
    END IF;
END $$;

ALTER TABLE products
    ADD COLUMN IF NOT EXISTS distribution_policy product_distribution_policy NOT NULL DEFAULT 'GLOBAL';

COMMENT ON COLUMN products.distribution_policy IS
    'GLOBAL: available at all selling stores unless hidden per store. RESTRICTED: only assigned stores.';

CREATE TABLE IF NOT EXISTS product_store_assignments (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_location_id   UUID NOT NULL REFERENCES store_locations(id) ON DELETE CASCADE,
    is_assigned         BOOLEAN NOT NULL DEFAULT true,
    is_pos_visible      BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (product_id, store_location_id)
);

CREATE INDEX IF NOT EXISTS idx_product_store_assignments_product
    ON product_store_assignments (product_id);

CREATE INDEX IF NOT EXISTS idx_product_store_assignments_store
    ON product_store_assignments (store_location_id);

COMMENT ON TABLE product_store_assignments IS
    'Per-store assortment: RESTRICTED uses is_assigned; GLOBAL uses is_pos_visible=false to hide at a store.';

INSERT INTO schema_version (version) VALUES (528) ON CONFLICT DO NOTHING;
