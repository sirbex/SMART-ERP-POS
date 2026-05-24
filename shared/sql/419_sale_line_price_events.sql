-- Sale line price edits and below-cost blocks (POS / API audit trail)
-- Migration: 419_sale_line_price_events.sql

CREATE TABLE IF NOT EXISTS sale_line_price_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    product_id UUID NOT NULL REFERENCES products(id),
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    user_id UUID NOT NULL,
    session_id TEXT,
    terminal_id TEXT,
    request_id TEXT,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'PRICE_EDIT',
        'BELOW_COST_BLOCKED'
    )),
    original_unit_price NUMERIC(18, 4),
    new_unit_price NUMERIC(18, 4),
    allocated_cost_per_selling_unit NUMERIC(18, 4) NOT NULL,
    allocated_total_cost NUMERIC(18, 4) NOT NULL,
    quantity NUMERIC(18, 4) NOT NULL,
    uom_id UUID REFERENCES uoms(id) ON DELETE SET NULL,
    reason TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_line_price_events_product
    ON sale_line_price_events(product_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_line_price_events_sale
    ON sale_line_price_events(sale_id)
    WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sale_line_price_events_user
    ON sale_line_price_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sale_line_price_events_type
    ON sale_line_price_events(event_type, created_at DESC);

COMMENT ON TABLE sale_line_price_events IS
    'Immutable audit of POS/API unit price edits and blocked below-cost sale attempts.';
