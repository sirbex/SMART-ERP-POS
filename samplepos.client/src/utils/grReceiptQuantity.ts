/**
 * SAP-style GR quantity split: billable fills open PO qty; excess is bonus (free) stock.
 */
export function splitGRReceiptQuantities(
  orderedQuantity: number,
  alreadyReceivedOnPo: number,
  receivedQuantity: number,
  isFullLineBonus: boolean
): { billableQty: number; bonusQty: number; openQty: number } {
  const openQty = Math.max(0, orderedQuantity - alreadyReceivedOnPo);
  if (isFullLineBonus) {
    return { billableQty: 0, bonusQty: receivedQuantity, openQty };
  }
  const billableQty = Math.min(receivedQuantity, openQty);
  const bonusQty = Math.max(0, receivedQuantity - openQty);
  return { billableQty, bonusQty, openQty };
}

export function grBillableLineTotal(
  orderedQuantity: number,
  alreadyReceivedOnPo: number,
  receivedQuantity: number,
  unitCost: number,
  isFullLineBonus: boolean
): number {
  const { billableQty } = splitGRReceiptQuantities(
    orderedQuantity,
    alreadyReceivedOnPo,
    receivedQuantity,
    isFullLineBonus
  );
  return billableQty * unitCost;
}
