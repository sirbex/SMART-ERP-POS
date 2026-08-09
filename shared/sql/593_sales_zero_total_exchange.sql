-- Migration 593: Allow zero-total sales (exchange fully covered by store credit)
-- Previous: total_amount > 0 blocked replacement sales where discount = full price.
BEGIN;

ALTER TABLE sales DROP CONSTRAINT IF EXISTS chk_sales_amounts_positive;

ALTER TABLE sales
  ADD CONSTRAINT chk_sales_amounts_positive
  CHECK (total_amount >= 0 AND total_cost >= 0);

COMMENT ON CONSTRAINT chk_sales_amounts_positive ON sales IS
  'Amounts non-negative. total_amount may be 0 when replacement is fully covered by exchange store credit.';

COMMIT;
