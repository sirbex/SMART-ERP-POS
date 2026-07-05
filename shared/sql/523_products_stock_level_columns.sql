-- Product stock-level columns (formerly in migrations/010 — never in auto-runner path)
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS max_stock_level DECIMAL(15, 4) NULL,
    ADD COLUMN IF NOT EXISTS reorder_point DECIMAL(15, 4) NULL,
    ADD COLUMN IF NOT EXISTS optimal_stock_level DECIMAL(15, 4) NULL;

CREATE INDEX IF NOT EXISTS idx_products_stock_levels
    ON products (max_stock_level, reorder_point)
    WHERE max_stock_level IS NOT NULL;

INSERT INTO schema_version (version) VALUES (523) ON CONFLICT DO NOTHING;
