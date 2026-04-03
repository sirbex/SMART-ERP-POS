-- ============================================================================
-- Migration 068: Schema Version Tracking
-- ============================================================================
-- Adds a schema_version table that records an integer version number.
-- The tenant migration service reads MAX(version) to decide whether
-- the database needs auto-upgrade before serving requests.
--
-- This table works alongside schema_migrations (filename-based tracking).
-- schema_version = "what version am I at?" (fast integer comparison)
-- schema_migrations = "which files have been applied?" (detailed tracking)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS schema_version (
    version  INT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed with version 1 to indicate this migration has run.
-- Future migrations will INSERT higher version numbers.
-- The tenantMigrationService compares MAX(version) against CURRENT_SCHEMA_VERSION.
INSERT INTO schema_version (version) VALUES (1);

COMMIT;
