-- Migration 564: Restaurant Phase 2.3 — Takeaway / Delivery guest details
-- Requires 560. Retail orders keep NULL guest fields (no behavior change).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'guest_name'
  ) THEN
    ALTER TABLE pos_orders ADD COLUMN guest_name VARCHAR(200) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'guest_phone'
  ) THEN
    ALTER TABLE pos_orders ADD COLUMN guest_phone VARCHAR(50) NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'delivery_address'
  ) THEN
    ALTER TABLE pos_orders ADD COLUMN delivery_address TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'pickup_label'
  ) THEN
    ALTER TABLE pos_orders ADD COLUMN pickup_label VARCHAR(120) NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pos_orders_channel_pending
  ON pos_orders (order_channel, status)
  WHERE order_channel IN ('TAKEAWAY', 'DELIVERY') AND status = 'PENDING';

COMMENT ON COLUMN pos_orders.guest_name IS
  'Phase 2.3: walk-in / takeaway / delivery guest display name (not necessarily a CRM customer)';
COMMENT ON COLUMN pos_orders.guest_phone IS
  'Phase 2.3: guest contact phone for takeaway/delivery';
COMMENT ON COLUMN pos_orders.delivery_address IS
  'Phase 2.3: delivery address text for DELIVERY channel';
COMMENT ON COLUMN pos_orders.pickup_label IS
  'Phase 2.3: takeaway pickup cue (e.g. Car 4, Window A)';
