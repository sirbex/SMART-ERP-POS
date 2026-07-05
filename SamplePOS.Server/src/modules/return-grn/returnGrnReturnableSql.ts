/**
 * SQL fragments for supplier return eligibility — aligned with
 * warehouseSupplierReturnDeductionService.deductForSupplierReturn.
 *
 * Multistore: returnable on-hand = LEAST(batch remaining, sum of lot balances).
 * Legacy: batch remaining only (warehouse layer not used on deduction).
 */
export function supplierReturnWarehouseBalanceSumSql(): string {
  return `COALESCE((
    SELECT SUM(ibal.quantity_on_hand)::numeric
    FROM product_lots pl
    INNER JOIN inventory_balances ibal
      ON ibal.product_lot_id = pl.id
     AND ibal.quantity_on_hand > 0
    WHERE pl.inventory_batch_id = ib.id
      AND pl.product_id = gri.product_id
  ), 0)::numeric`;
}

export function supplierReturnBatchOnHandSql(): string {
  return 'COALESCE(ib.remaining_quantity, 0)::numeric';
}

/** Physical on-hand for return caps — mirrors post-time deduction constraints. */
export function supplierReturnOnHandQuantityExpr(multistore: boolean): string {
  if (!multistore) {
    return supplierReturnBatchOnHandSql();
  }
  return `LEAST(${supplierReturnBatchOnHandSql()}, ${supplierReturnWarehouseBalanceSumSql()})`;
}

/** Document entitlement: received (batch or GR line) minus prior posted returns. */
export function supplierReturnDocumentEntitlementSql(): string {
  return `CASE
    WHEN ib.id IS NOT NULL THEN COALESCE(ib.quantity, 0)::numeric - COALESCE(returned.qty, 0)
    ELSE gri.received_quantity::numeric
         * COALESCE(pu.conversion_factor, def_pu.conversion_factor, 1)::numeric
         - COALESCE(returned.qty, 0)
  END`;
}
