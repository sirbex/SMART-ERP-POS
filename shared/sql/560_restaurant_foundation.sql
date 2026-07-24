-- Migration 560: Restaurant Module Foundation (Phase 1)
--
-- Optional FOH layer on existing POS Order→Payment + sales SSOT.
-- Flag-off default: restaurant_mode_enabled = FALSE → zero behavior change for retail.
-- Orders remain in pos_orders; payment still completes via salesService.createSale.

-- ============================================================
-- 1. Feature flag (treasury-style)
-- ============================================================
ALTER TABLE system_settings
  ADD COLUMN IF NOT EXISTS restaurant_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN system_settings.restaurant_mode_enabled IS
  'Phase 1 Restaurant: when true, restaurant tables/KOT/POS UI and mutating APIs are available';

-- ============================================================
-- 2. Product menu flag (reuse products — no parallel catalog)
-- ============================================================
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS available_in_restaurant BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS kitchen_station VARCHAR(64) NULL;

CREATE INDEX IF NOT EXISTS idx_products_available_in_restaurant
  ON products (available_in_restaurant)
  WHERE available_in_restaurant = TRUE;

COMMENT ON COLUMN products.available_in_restaurant IS
  'When true, product appears on Restaurant POS menu buttons';
COMMENT ON COLUMN products.kitchen_station IS
  'Optional KOT routing station (e.g. KITCHEN, BAR, PIZZA). NULL = default kitchen';

-- ============================================================
-- 3. Floor tables
-- ============================================================
CREATE TABLE IF NOT EXISTS restaurant_tables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(32) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  zone            VARCHAR(64) NOT NULL DEFAULT 'MAIN',
  seats           INTEGER NOT NULL DEFAULT 4 CHECK (seats >= 0),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  status          VARCHAR(20) NOT NULL DEFAULT 'FREE'
                  CHECK (status IN ('FREE', 'OCCUPIED', 'BILLING')),
  current_order_id UUID NULL REFERENCES pos_orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_restaurant_tables_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_tables_status ON restaurant_tables(status);
CREATE INDEX IF NOT EXISTS idx_restaurant_tables_active ON restaurant_tables(is_active, sort_order);

-- Seed SambaPOS-style starter floor (idempotent)
INSERT INTO restaurant_tables (code, name, zone, seats, sort_order)
VALUES
  ('T1', 'Table 1', 'MAIN', 4, 10),
  ('T2', 'Table 2', 'MAIN', 4, 20),
  ('T3', 'Table 3', 'MAIN', 4, 30),
  ('T4', 'Table 4', 'MAIN', 4, 40),
  ('VIP', 'VIP', 'VIP', 6, 50),
  ('TA', 'Take Away', 'SERVICE', 0, 100),
  ('DL', 'Delivery', 'SERVICE', 0, 110)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- 4. Extend pos_orders (SSOT open checks — no restaurant_orders table)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'table_id'
  ) THEN
    ALTER TABLE pos_orders
      ADD COLUMN table_id UUID NULL REFERENCES restaurant_tables(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'order_channel'
  ) THEN
    ALTER TABLE pos_orders
      ADD COLUMN order_channel VARCHAR(20) NOT NULL DEFAULT 'RETAIL'
        CHECK (order_channel IN ('RETAIL', 'DINE_IN', 'TAKEAWAY', 'DELIVERY'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'waiter_id'
  ) THEN
    ALTER TABLE pos_orders
      ADD COLUMN waiter_id UUID NULL REFERENCES users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'kitchen_status'
  ) THEN
    ALTER TABLE pos_orders
      ADD COLUMN kitchen_status VARCHAR(20) NOT NULL DEFAULT 'NONE'
        CHECK (kitchen_status IN ('NONE', 'SENT', 'PREPARING', 'READY', 'SERVED'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_orders_table_id
  ON pos_orders(table_id) WHERE table_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pos_orders_channel
  ON pos_orders(order_channel) WHERE order_channel <> 'RETAIL';

-- ============================================================
-- 5. KOT tracking on order lines (no prices on tickets)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_order_items' AND column_name = 'kitchen_sent_at'
  ) THEN
    ALTER TABLE pos_order_items ADD COLUMN kitchen_sent_at TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_order_items' AND column_name = 'line_notes'
  ) THEN
    ALTER TABLE pos_order_items ADD COLUMN line_notes TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_order_items' AND column_name = 'kitchen_station'
  ) THEN
    ALTER TABLE pos_order_items ADD COLUMN kitchen_station VARCHAR(64) NULL;
  END IF;
END $$;

-- ============================================================
-- 6. Kitchen Order Tickets (immutable fire batches — qty only)
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS restaurant_kot_number_seq START 1;

CREATE TABLE IF NOT EXISTS restaurant_kot (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kot_number      VARCHAR(40) NOT NULL,
  order_id        UUID NOT NULL REFERENCES pos_orders(id) ON DELETE RESTRICT,
  table_code      VARCHAR(32) NULL,
  table_name      VARCHAR(120) NULL,
  waiter_name     VARCHAR(200) NULL,
  station         VARCHAR(64) NOT NULL DEFAULT 'KITCHEN',
  fired_by        UUID NOT NULL REFERENCES users(id),
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_restaurant_kot_number UNIQUE (kot_number)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_kot_order ON restaurant_kot(order_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_kot_fired ON restaurant_kot(fired_at DESC);

CREATE TABLE IF NOT EXISTS restaurant_kot_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kot_id          UUID NOT NULL REFERENCES restaurant_kot(id) ON DELETE CASCADE,
  order_item_id   UUID NULL REFERENCES pos_order_items(id) ON DELETE SET NULL,
  product_name    VARCHAR(255) NOT NULL,
  quantity        NUMERIC(15,4) NOT NULL CHECK (quantity > 0),
  line_notes      TEXT NULL
  -- INTENTIONALLY NO PRICE COLUMNS — kitchen tickets must never show money
);

CREATE INDEX IF NOT EXISTS idx_restaurant_kot_items_kot ON restaurant_kot_items(kot_id);

-- ============================================================
-- 7. RBAC permissions
-- ============================================================
INSERT INTO rbac_permissions_catalog (key, module, action, description)
VALUES
  ('restaurant.read', 'restaurant', 'read', 'View restaurant floor, open checks, and menu'),
  ('restaurant.order', 'restaurant', 'create', 'Create and edit restaurant orders (waiter)'),
  ('restaurant.kitchen', 'restaurant', 'update', 'Send and manage kitchen tickets'),
  ('restaurant.pay', 'restaurant', 'pay', 'Print bill and complete restaurant payment'),
  ('restaurant.manage', 'restaurant', 'manage', 'Manage restaurant tables and module settings')
ON CONFLICT (key) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, p.key, '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
CROSS JOIN (VALUES
  ('restaurant.read'),
  ('restaurant.order'),
  ('restaurant.kitchen'),
  ('restaurant.manage')
) AS p(key)
WHERE r.name IN ('Super Administrator', 'Administrator', 'Manager')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- Admin + Cashier may take payment (Accountant granted in 568)
INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, 'restaurant.pay', '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
WHERE r.name IN ('Super Administrator', 'Administrator', 'Cashier')
ON CONFLICT (role_id, permission_key) DO NOTHING;

INSERT INTO rbac_role_permissions (role_id, permission_key, granted_by)
SELECT r.id, p.key, '00000000-0000-0000-0000-000000000001'
FROM rbac_roles r
CROSS JOIN (VALUES
  ('restaurant.read'),
  ('restaurant.order'),
  ('restaurant.kitchen')
) AS p(key)
WHERE r.name = 'Cashier'
ON CONFLICT (role_id, permission_key) DO NOTHING;
