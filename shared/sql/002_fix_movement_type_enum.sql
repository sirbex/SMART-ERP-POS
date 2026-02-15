-- Fix movement_type enum to match application code
-- Old enum: ('IN', 'OUT', 'ADJUSTMENT', 'RETURN', 'TRANSFER')
-- New enum: More granular types for better tracking

-- Drop old enum and recreate with correct values
ALTER TABLE stock_movements ALTER COLUMN movement_type TYPE VARCHAR(50);
DROP TYPE IF EXISTS movement_type CASCADE;

CREATE TYPE movement_type AS ENUM (
  'GOODS_RECEIPT',
  'SALE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN',
  'DAMAGE',
  'EXPIRY'
);

ALTER TABLE stock_movements 
  ALTER COLUMN movement_type TYPE movement_type 
  USING movement_type::text::movement_type;

-- Update existing records to match new enum
-- Map old values to new values
UPDATE stock_movements
SET movement_type = CASE movement_type::text
  WHEN 'IN' THEN 'GOODS_RECEIPT'::movement_type
  WHEN 'OUT' THEN 'SALE'::movement_type
  WHEN 'ADJUSTMENT' THEN 'ADJUSTMENT_IN'::movement_type
  WHEN 'RETURN' THEN 'RETURN'::movement_type
  WHEN 'TRANSFER' THEN 'TRANSFER_IN'::movement_type
  ELSE movement_type::text::movement_type
END;
