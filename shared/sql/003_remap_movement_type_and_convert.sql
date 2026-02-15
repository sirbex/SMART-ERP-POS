-- Remap existing stock_movements.movement_type values to new enum values
-- This script assumes the column is currently VARCHAR/TEXT and the new enum type "movement_type" exists.

-- Map legacy values to new granular types while column is text
UPDATE stock_movements SET movement_type = 'GOODS_RECEIPT' WHERE movement_type = 'IN';
UPDATE stock_movements SET movement_type = 'SALE'          WHERE movement_type = 'OUT';
UPDATE stock_movements SET movement_type = 'RETURN'        WHERE movement_type = 'RETURN';
UPDATE stock_movements SET movement_type = 'TRANSFER_IN'   WHERE movement_type = 'TRANSFER';
-- Ambiguous legacy 'ADJUSTMENT' mapped to inbound by default (tune later if needed)
UPDATE stock_movements SET movement_type = 'ADJUSTMENT_IN' WHERE movement_type = 'ADJUSTMENT';

-- Convert column back to enum using current string values
ALTER TABLE stock_movements 
  ALTER COLUMN movement_type TYPE movement_type 
  USING movement_type::text::movement_type;
