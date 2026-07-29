-- 574: Line added_at + correct per-line attribution (Toast / Aloha)
--
-- Professional FOH: each line shows who rang it (logged-in actor), not only the
-- check owner. added_at records when the line was rung for the ticket timeline.
-- Floor uses check opened_at for "how long has this table been open".

ALTER TABLE pos_order_items
  ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ NULL;

-- New rings default to now; backfill existing rows from order open time when known
UPDATE pos_order_items oi
SET added_at = COALESCE(oi.added_at, o.created_at, NOW())
FROM pos_orders o
WHERE oi.order_id = o.id
  AND oi.added_at IS NULL;

ALTER TABLE pos_order_items
  ALTER COLUMN added_at SET DEFAULT NOW();

-- Prefer NOT NULL after backfill (safe if all rows filled)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pos_order_items'
      AND column_name = 'added_at'
  ) AND NOT EXISTS (
    SELECT 1 FROM pos_order_items WHERE added_at IS NULL LIMIT 1
  ) THEN
    ALTER TABLE pos_order_items ALTER COLUMN added_at SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_order_items_added_at
  ON pos_order_items (order_id, added_at);

-- Heal null added_by only when still empty (do NOT overwrite a real cashier/manager stamp)
UPDATE pos_order_items oi
SET added_by = COALESCE(o.waiter_id, o.created_by)
FROM pos_orders o
WHERE oi.order_id = o.id
  AND oi.added_by IS NULL
  AND (o.waiter_id IS NOT NULL OR o.created_by IS NOT NULL);

INSERT INTO schema_version (version) VALUES (574) ON CONFLICT DO NOTHING;
