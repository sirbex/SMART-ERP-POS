-- Migration tracking table
-- This MUST be the first migration to run. It creates the table that tracks
-- which migrations have been applied, preventing double-execution in production.

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checksum TEXT -- optional: SHA-256 of the file for drift detection
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON schema_migrations (filename);
