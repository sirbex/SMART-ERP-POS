-- Migration 562: Restaurant Phase 2.1 — Kitchen Display status on KOT tickets
-- Requires 560_restaurant_foundation.sql
-- Flag-off: no behavior change; KDS only used when restaurant_mode_enabled.

ALTER TABLE restaurant_kot
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'SENT';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_restaurant_kot_status'
  ) THEN
    ALTER TABLE restaurant_kot
      ADD CONSTRAINT chk_restaurant_kot_status
      CHECK (status IN ('SENT', 'PREPARING', 'READY', 'BUMPED'));
  END IF;
END $$;

ALTER TABLE restaurant_kot
  ADD COLUMN IF NOT EXISTS status_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE restaurant_kot
  ADD COLUMN IF NOT EXISTS status_updated_by UUID NULL REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_restaurant_kot_status_active
  ON restaurant_kot (status, fired_at)
  WHERE status <> 'BUMPED';

COMMENT ON COLUMN restaurant_kot.status IS
  'KDS ticket lifecycle: SENT → PREPARING → READY → BUMPED (cleared from board)';
