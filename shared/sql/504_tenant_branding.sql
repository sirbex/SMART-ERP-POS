-- ============================================================
-- TENANT PWA BRANDING COLUMNS
-- Migration: 504_tenant_branding.sql
-- Purpose: Add branding columns to tenants table for dynamic PWA manifest
-- Runs against: MASTER database (pos_system)
-- ============================================================

-- Add PWA branding columns to the tenants table
-- Wrapped in DO block: safe to run on tenant DBs that don't have a tenants table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) THEN
    EXECUTE 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_name VARCHAR(255)';
    EXECUTE 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_short_name VARCHAR(30)';
    EXECUTE 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_theme_color VARCHAR(7) DEFAULT ''#3b82f6''';
    EXECUTE 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_background_color VARCHAR(7) DEFAULT ''#0f172a''';
    EXECUTE 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_icon_192_path VARCHAR(500)';
    EXECUTE 'ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_icon_512_path VARCHAR(500)';
  END IF;
END $$;
