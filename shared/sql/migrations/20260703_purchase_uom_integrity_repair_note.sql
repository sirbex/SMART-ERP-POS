-- Purchase UoM integrity — deployment data repair (operator-run, not auto-applied).
--
-- Schema already has products.purchase_uom_id without FK to product_uoms.
-- Application layer now enforces alignment on Product UoM mutations and product save.
--
-- BEFORE enabling strict MUoM guards in production, run on each tenant:
--   npm run audit:muom-purchase-uom-orphans
--   npm run repair:muom-purchase-uom-orphans -- --sku=<SKU> --factor=<N> --execute
--
-- Verify:
--   npm run audit:muom-purchase-uom-gap
--
-- No DDL changes in this migration; documents the repair workflow only.

SELECT 1;
