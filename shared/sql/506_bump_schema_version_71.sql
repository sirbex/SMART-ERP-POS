-- Migration 506: Bump schema_version to 71
-- Synchronizes the schema_version table with CURRENT_SCHEMA_VERSION = 71 in code.
-- This re-enables the auto-migrator after migrations 502-505 were applied.
-- The auto-migrator checks: MAX(version) < CURRENT_SCHEMA_VERSION → run pending files.
-- Without this, CURRENT_SCHEMA_VERSION = 71 in code but version table stays at 70,
-- so the migrator will always re-run pending migrations on every startup.

INSERT INTO schema_version (version) VALUES (71) ON CONFLICT DO NOTHING;
