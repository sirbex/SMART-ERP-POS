-- Migration 530: Store-aware stock count lines (Phase 8) + expiry automation flag (Phase 9)

ALTER TABLE stock_count_lines
    ADD COLUMN IF NOT EXISTS product_lot_id UUID REFERENCES product_lots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_count_lines_product_lot
    ON stock_count_lines(product_lot_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_count_lines_lot
    ON stock_count_lines(stock_count_id, product_lot_id)
    WHERE product_lot_id IS NOT NULL;

COMMENT ON COLUMN stock_count_lines.product_lot_id IS
    'Multistore stock counts snapshot per product lot at a store (location_id on parent count).';

ALTER TABLE system_settings
    ADD COLUMN IF NOT EXISTS expiry_automation_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN system_settings.expiry_automation_enabled IS
    'When true, nightly job moves expired sellable stock from MAIN/SELLING to EXPIRED store.';

INSERT INTO schema_version (version) VALUES (530) ON CONFLICT DO NOTHING;
