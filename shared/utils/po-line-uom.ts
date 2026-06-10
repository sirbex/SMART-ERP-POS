/**
 * PO line quantity/cost conversions (ERP MUoM).
 * PO line quantity is in the selected **order UoM**; reorder levels/qty in inventory are **base UoM**.
 */

export function poLineBaseQuantity(
  quantity: number | string,
  conversionFactor: number | string = 1,
): number {
  const q = Number(quantity) || 0;
  const f = Number(conversionFactor) || 1;
  return q * f;
}

/** Preserve base quantity when the user switches order UoM (e.g. 60 PC → 5 BOX when factor=12). */
export function convertPoLineQuantityForUomChange(
  quantity: string | number,
  oldFactor: number | string,
  newFactor: number | string,
): string {
  const baseQty = poLineBaseQuantity(quantity, oldFactor);
  const nf = Number(newFactor) || 1;
  if (nf <= 0) return String(quantity);
  const converted = baseQty / nf;
  const rounded = Math.round(converted * 1e6) / 1e6;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(6).replace(/\.?0+$/, '');
}

/** Display unit cost = base unit cost × factor (SAP net price per order UoM). */
export function poLineDisplayUnitCost(
  baseCost: number | string,
  factor: number | string = 1,
): string {
  const b = Number(baseCost) || 0;
  const f = Number(factor) || 1;
  return (Math.round(b * f * 100) / 100).toFixed(2);
}

/** Derive canonical base cost after the user edits display unit cost. */
export function poLineBaseCostFromDisplay(
  unitCost: number | string,
  factor: number | string = 1,
): string {
  const c = Number(unitCost) || 0;
  const f = Number(factor) || 1;
  if (f <= 0) return (Math.round(c * 100) / 100).toFixed(2);
  return (Math.round((c / f) * 100) / 100).toFixed(2);
}

export function poLineTotal(quantity: number | string, unitCost: number | string): string {
  const q = Number(quantity) || 0;
  const c = Number(unitCost) || 0;
  return (Math.round(q * c * 100) / 100).toFixed(2);
}
