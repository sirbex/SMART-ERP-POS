-- Recreate fn_ledger_stock_balance
-- Dropped by 067_drop_replaced_and_orphaned_functions.sql but still called
-- by SamplePOS.Server/src/modules/inventory/inventoryLedgerRepository.ts:160

CREATE OR REPLACE FUNCTION fn_ledger_stock_balance(p_product_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(
    CASE
      WHEN movement_type IN ('GOODS_RECEIPT','ADJUSTMENT_IN','TRANSFER_IN','RETURN')
        THEN quantity
      WHEN movement_type IN ('SALE','ADJUSTMENT_OUT','TRANSFER_OUT','DAMAGE','EXPIRY')
        THEN -quantity
      ELSE quantity
    END
  ), 0)
  FROM stock_movements
  WHERE product_id = p_product_id;
$$ LANGUAGE sql STABLE;

COMMENT ON FUNCTION fn_ledger_stock_balance(UUID) IS
  'Ledger-derived stock balance for a product (sum of signed movements). Called by inventoryLedgerRepository.';
