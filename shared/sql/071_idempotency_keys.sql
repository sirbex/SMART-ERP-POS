-- Migration 071: Idempotency Keys Table
-- Prevents duplicate transaction submissions from network retries and double-clicks.
-- Clients send X-Idempotency-Key header; the middleware caches successful responses
-- and replays them on repeat requests. Records expire after 24 hours.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL,
  user_id    TEXT,
  method     TEXT        NOT NULL,
  path       TEXT        NOT NULL,
  status_code INTEGER,
  response_body JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);

-- Unique per key (scoped per tenant DB — each tenant has its own idempotency_keys table)
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_key
  ON idempotency_keys (key);

-- For TTL-based cleanup (can be run periodically or via pg_cron)
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_expires_at
  ON idempotency_keys (expires_at);
