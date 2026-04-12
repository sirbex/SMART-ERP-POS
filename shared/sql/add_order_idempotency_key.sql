-- Migration: Add idempotency_key to pos_orders for offline sync deduplication
-- Safe to run multiple times (IF NOT EXISTS)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pos_orders' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE pos_orders ADD COLUMN idempotency_key VARCHAR(100) UNIQUE;
    CREATE INDEX idx_pos_orders_idempotency_key ON pos_orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
  END IF;
END $$;
