-- Migration 563: Restaurant Phase 2.2 — Kitchen/bar station registry + printer routing
-- Requires 560 (+ 562 for KDS). Flag-off: unused until restaurant_mode_enabled.

CREATE TABLE IF NOT EXISTS restaurant_stations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            VARCHAR(64) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  printer_name    VARCHAR(200) NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_restaurant_stations_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_restaurant_stations_active
  ON restaurant_stations (is_active, sort_order);

-- Exactly one default station preferred (enforced in service; seed one default)
INSERT INTO restaurant_stations (code, name, printer_name, sort_order, is_default)
VALUES
  ('KITCHEN', 'Kitchen', NULL, 10, TRUE),
  ('BAR', 'Bar', NULL, 20, FALSE),
  ('PIZZA', 'Pizza', NULL, 30, FALSE)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE restaurant_stations IS
  'Phase 2.2: prep stations for KOT split/routing (KITCHEN/BAR/PIZZA). printer_name optional for ESC/POS bridge.';
COMMENT ON COLUMN restaurant_stations.printer_name IS
  'Optional local printer / bridge target name. NULL = default browser/bridge printer.';
COMMENT ON COLUMN products.kitchen_station IS
  'Routes menu item to restaurant_stations.code on Send KOT. NULL → default station.';
