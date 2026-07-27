-- Migration 570: Samba-style restaurant order tags (modifiers)
-- Catalog + mappings; selected tags denormalize into pos_order_items.line_notes for KOT/print.

CREATE TABLE IF NOT EXISTS restaurant_order_tag_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            VARCHAR(80) NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  min_select      INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
  max_select      INTEGER NULL CHECK (max_select IS NULL OR max_select >= 0),
  auto_prompt     BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_restaurant_order_tag_groups_name UNIQUE (name)
);

COMMENT ON TABLE restaurant_order_tag_groups IS
  'Samba Order Tag Groups — Prep / Remove / Add-ons. auto_prompt opens pad on FOH add.';

CREATE TABLE IF NOT EXISTS restaurant_order_tags (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES restaurant_order_tag_groups(id) ON DELETE CASCADE,
  label           VARCHAR(80) NOT NULL,
  prefix          VARCHAR(20) NULL,
  price           NUMERIC(15,4) NOT NULL DEFAULT 0 CHECK (price >= 0),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_restaurant_order_tags_group_label UNIQUE (group_id, label)
);

COMMENT ON COLUMN restaurant_order_tags.prefix IS
  'Optional Samba-style prefix shown on KOT (NO / EXTRA / WITH). NULL = label alone.';
COMMENT ON COLUMN restaurant_order_tags.price IS
  'Optional surcharge added to line unit price when selected (0 = kitchen note only).';

CREATE INDEX IF NOT EXISTS idx_restaurant_order_tags_group
  ON restaurant_order_tags(group_id, sort_order)
  WHERE is_active = TRUE;

-- Mapping: NULL product + NULL category = global (all menu items)
CREATE TABLE IF NOT EXISTS restaurant_order_tag_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES restaurant_order_tag_groups(id) ON DELETE CASCADE,
  product_id      UUID NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id     UUID NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_order_tag_map_global
  ON restaurant_order_tag_mappings (group_id)
  WHERE product_id IS NULL AND category_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_order_tag_map_product
  ON restaurant_order_tag_mappings (group_id, product_id)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_restaurant_order_tag_map_category
  ON restaurant_order_tag_mappings (group_id, category_id)
  WHERE category_id IS NOT NULL AND product_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_order_tag_map_product
  ON restaurant_order_tag_mappings(product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_order_tag_map_category
  ON restaurant_order_tag_mappings(category_id)
  WHERE category_id IS NOT NULL;

-- Structured snapshot on the line (KOT still uses line_notes text)
ALTER TABLE pos_order_items
  ADD COLUMN IF NOT EXISTS order_tags JSONB NULL;

COMMENT ON COLUMN pos_order_items.order_tags IS
  'Selected order tags snapshot: [{id,label,prefix,price}]. line_notes is denormalized for KOT.';

-- Seed starter groups (idempotent) — drink + food prep vocabulary
INSERT INTO restaurant_order_tag_groups (name, sort_order, min_select, max_select, auto_prompt, is_active)
VALUES
  ('Drink prep', 10, 0, NULL, TRUE, TRUE),
  ('Remove / less', 20, 0, NULL, FALSE, TRUE),
  ('Add / extra', 30, 0, NULL, FALSE, TRUE),
  ('Cook / heat', 40, 0, 1, TRUE, TRUE)
ON CONFLICT (name) DO NOTHING;

INSERT INTO restaurant_order_tags (group_id, label, prefix, price, sort_order)
SELECT g.id, t.label, t.prefix, 0, t.sort_order
FROM restaurant_order_tag_groups g
JOIN (VALUES
  ('Drink prep', 'With ice', NULL, 10),
  ('Drink prep', 'No ice', 'NO', 20),
  ('Drink prep', 'Very cold', NULL, 30),
  ('Drink prep', 'Room temp', NULL, 40),
  ('Remove / less', 'Salt', 'NO', 10),
  ('Remove / less', 'Sugar', 'NO', 20),
  ('Remove / less', 'Onion', 'NO', 30),
  ('Remove / less', 'Chili', 'NO', 40),
  ('Add / extra', 'Salt', 'EXTRA', 10),
  ('Add / extra', 'Sugar', 'EXTRA', 20),
  ('Add / extra', 'Lemon', 'WITH', 30),
  ('Cook / heat', 'Very hot', NULL, 10),
  ('Cook / heat', 'Mild', NULL, 20),
  ('Cook / heat', 'Spicy', NULL, 30)
) AS t(group_name, label, prefix, sort_order)
  ON g.name = t.group_name
ON CONFLICT (group_id, label) DO NOTHING;

-- Global mapping so every restaurant product can use starter tags
INSERT INTO restaurant_order_tag_mappings (group_id, product_id, category_id)
SELECT g.id, NULL, NULL
FROM restaurant_order_tag_groups g
WHERE g.name IN ('Drink prep', 'Remove / less', 'Add / extra', 'Cook / heat')
  AND NOT EXISTS (
    SELECT 1 FROM restaurant_order_tag_mappings m
    WHERE m.group_id = g.id AND m.product_id IS NULL AND m.category_id IS NULL
  );

INSERT INTO schema_version (version) VALUES (570) ON CONFLICT DO NOTHING;
