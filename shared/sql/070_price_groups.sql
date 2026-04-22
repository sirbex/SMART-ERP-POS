-- ============================================================================
-- Migration 070: Price Groups
--
-- Introduces a price_groups master table that controls HOW a price is
-- calculated for a customer.  Unlike customer_groups (which apply a flat
-- discount), a price_group defines the pricing MODE:
--
--   STANDARD  — normal pricing engine (tiers, rules, formula, base price)
--   AT_COST   — price is always the current inventory cost price (0 margin)
--
-- customers.price_group_id (nullable) links each customer to a price group.
-- When NULL the customer is treated as STANDARD.
-- ============================================================================

BEGIN;

-- ── 1. price_groups master table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS price_groups (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         VARCHAR(255) NOT NULL UNIQUE,
    pricing_mode VARCHAR(20)  NOT NULL DEFAULT 'STANDARD'
                 CHECK (pricing_mode IN ('STANDARD', 'AT_COST')),
    description  TEXT,
    is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_groups_mode
    ON price_groups (pricing_mode) WHERE is_active = TRUE;

-- ── 2. Seed default groups ───────────────────────────────────────────────────
INSERT INTO price_groups (name, pricing_mode, description)
VALUES
    ('Standard',
     'STANDARD',
     'Default pricing — uses the configured selling price, tiers, and price rules'),
    ('At Cost',
     'AT_COST',
     'Sells at inventory cost price — zero margin. Used for internal transfers, staff, or preferred partners')
ON CONFLICT (name) DO NOTHING;

-- ── 3. Add price_group_id FK to customers ────────────────────────────────────
ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS price_group_id UUID
        REFERENCES price_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_price_group_id
    ON customers (price_group_id) WHERE price_group_id IS NOT NULL;

-- ── 4. Schema version ────────────────────────────────────────────────────────
INSERT INTO schema_version (version, applied_at)
SELECT 70, NOW()
WHERE NOT EXISTS (SELECT 1 FROM schema_version WHERE version = 70);

COMMIT;
