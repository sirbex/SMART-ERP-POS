/**
 * SAP-style PO line net-received model (Phase 1B).
 *
 * Gross received (poi.received_quantity) is immutable history.
 * Returned qty is derived from posted Return GRNs linked via goods_receipt_items.po_item_id.
 * Net received = gross − returned (never below 0).
 * Open qty = ordered − net received.
 *
 * Does NOT decrement poi.received_quantity.
 */

/** Posted return qty in purchase/receipt UoM for a PO line (EXISTS join avoids double-count). */
export function poItemReturnedQuantitySql(poiAlias = 'poi'): string {
  return `COALESCE((
    SELECT SUM(rl.quantity)
    FROM return_grn_lines rl
    JOIN return_grn rg ON rg.id = rl.rgrn_id AND rg.status = 'POSTED'
    WHERE EXISTS (
      SELECT 1
      FROM goods_receipt_items gri
      WHERE gri.goods_receipt_id = rg.grn_id
        AND gri.po_item_id = ${poiAlias}.id
        AND gri.product_id = rl.product_id
    )
  ), 0)`;
}

/** Net received on PO line (purchase UoM). */
export function poItemNetReceivedQuantitySql(poiAlias = 'poi'): string {
  const returned = poItemReturnedQuantitySql(poiAlias);
  return `GREATEST(0, COALESCE(${poiAlias}.received_quantity, 0)::numeric - (${returned})::numeric)`;
}

/** Remaining qty open for receipt on PO line. */
export function poItemOpenQuantitySql(poiAlias = 'poi'): string {
  const net = poItemNetReceivedQuantitySql(poiAlias);
  return `GREATEST(0, COALESCE(${poiAlias}.ordered_quantity, 0)::numeric - (${net})::numeric)`;
}

/** True when every PO line has net received >= ordered. */
export function poFullyReceivedHavingSql(poAlias = 'po'): string {
  const net = poItemNetReceivedQuantitySql('poi');
  return `NOT EXISTS (
    SELECT 1 FROM purchase_order_items poi
    WHERE poi.purchase_order_id = ${poAlias}.id
      AND COALESCE(poi.ordered_quantity, 0)::numeric > (${net})::numeric
  )`;
}
