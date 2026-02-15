-- Multi-Unit of Measure (UoM)
-- Safe additive migration: does not remove existing columns (unit_of_measure, conversion_factor)
-- Creates new canonical UoM tables and adds base_uom_id to products

-- 1) UoMs master
CREATE TABLE IF NOT EXISTS uoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  symbol VARCHAR(20),
  type VARCHAR(20) CHECK (type IN ('QUANTITY','WEIGHT','VOLUME','LENGTH','AREA','TIME')) DEFAULT 'QUANTITY',
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2) Product ↔ UoM mappings
CREATE TABLE IF NOT EXISTS product_uoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  uom_id UUID NOT NULL REFERENCES uoms(id) ON DELETE RESTRICT,
  conversion_factor DECIMAL(18,6) NOT NULL CHECK (conversion_factor > 0),
  barcode VARCHAR(100),
  is_default BOOLEAN DEFAULT false,
  price_override DECIMAL(18,6),
  cost_override DECIMAL(18,6),
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, uom_id)
);

-- Only one default UoM per product (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS ux_product_uoms_default
ON product_uoms(product_id)
WHERE is_default = true;

-- 3) Products: base_uom_id (kept nullable for backfill compatibility)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS base_uom_id UUID REFERENCES uoms(id);

CREATE INDEX IF NOT EXISTS idx_product_uoms_product ON product_uoms(product_id);
CREATE INDEX IF NOT EXISTS idx_product_uoms_uom ON product_uoms(uom_id);
