-- ============================================================
-- TENANT PWA BRANDING COLUMNS
-- Migration: 504_tenant_branding.sql
-- Purpose: Add branding columns to tenants table for dynamic PWA manifest
-- Runs against: MASTER database (pos_system)
-- ============================================================

-- Add PWA branding columns to the tenants table
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_name VARCHAR(255);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_short_name VARCHAR(30);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_theme_color VARCHAR(7) DEFAULT '#3b82f6';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_background_color VARCHAR(7) DEFAULT '#0f172a';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_icon_192_path VARCHAR(500);
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pwa_icon_512_path VARCHAR(500);
