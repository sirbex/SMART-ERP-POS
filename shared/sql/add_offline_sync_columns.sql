-- Add columns for offline sale sync (idempotency + tracking)
-- Safe to re-run: uses IF NOT EXISTS

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE sales ADD COLUMN idempotency_key VARCHAR(100) UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sales' AND column_name = 'offline_id'
  ) THEN
    ALTER TABLE sales ADD COLUMN offline_id VARCHAR(100);
  END IF;
END $$;

-- Index for fast idempotency lookups
CREATE INDEX IF NOT EXISTS idx_sales_idempotency_key ON sales(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sales_offline_id ON sales(offline_id) WHERE offline_id IS NOT NULL;
