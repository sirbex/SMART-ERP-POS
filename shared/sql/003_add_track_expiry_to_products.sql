-- Migration: Add track_expiry field to products table
-- Purpose: Allow per-product configuration of expiry date tracking
-- Date: 2025-11-01

-- Add track_expiry column to products table
ALTER TABLE products 
ADD COLUMN track_expiry BOOLEAN NOT NULL DEFAULT false;

-- Add index for filtering products by expiry tracking
CREATE INDEX idx_products_track_expiry ON products(track_expiry);

-- Update comment
COMMENT ON COLUMN products.track_expiry IS 'Whether this product requires expiry date tracking (perishable goods)';
