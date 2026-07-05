-- Migration 531: Store/lot trace on sale lines for multistore sales (Phase 10) and returns (Phase 11)

ALTER TABLE sale_items
    ADD COLUMN IF NOT EXISTS store_location_id UUID REFERENCES store_locations(id) ON DELETE SET NULL;

ALTER TABLE sale_items
    ADD COLUMN IF NOT EXISTS product_lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_store_location
    ON sale_items(store_location_id);

CREATE INDEX IF NOT EXISTS idx_sale_items_product_lot
    ON sale_items(product_lot_id);

COMMENT ON COLUMN sale_items.store_location_id IS
    'POS selling store that fulfilled this line when multistore is enabled.';

COMMENT ON COLUMN sale_items.product_lot_id IS
    'Primary product lot consumed (FEFO) for this sale line when multistore is enabled.';

ALTER TABLE sale_refund_items
    ADD COLUMN IF NOT EXISTS store_location_id UUID REFERENCES store_locations(id) ON DELETE SET NULL;

ALTER TABLE sale_refund_items
    ADD COLUMN IF NOT EXISTS product_lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_refund_items_store_location
    ON sale_refund_items(store_location_id);

INSERT INTO schema_version (version) VALUES (531) ON CONFLICT DO NOTHING;
