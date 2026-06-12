/**
 * Return GRN MUoM helpers — client-side display and caps only.
 * Server validates in base_quantity (SSoT).
 */

export interface ReturnGrnUomOption {
  uomId: string;
  uomName: string;
  uomSymbol: string;
  conversionFactor: number;
  isDefault?: boolean;
}

function roundQty(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

export function uomToBaseQuantity(quantity: number, factorToBase: number): number {
  return roundQty(quantity * (factorToBase || 1));
}

export function baseToUomQuantity(baseQuantity: number, factorToBase: number): number {
  if (!factorToBase || factorToBase <= 0) return baseQuantity;
  return roundQty(baseQuantity / factorToBase);
}

export function formatQtyLabel(n: number): string {
  const v = roundQty(n);
  if (Number.isInteger(v)) return String(v);
  return String(v).replace(/\.?0+$/, '');
}

/** e.g. "2 BOX (20 PCS)" when receipt UoM differs from base. */
export function formatReturnGrnDualQty(
  baseQty: number,
  receiptUom: { symbol?: string; uomSymbol?: string; conversionFactor: number },
  baseSymbol: string,
): string {
  const symbol = receiptUom.symbol || receiptUom.uomSymbol || 'units';
  const displayQty = baseToUomQuantity(baseQty, receiptUom.conversionFactor);
  const primary = `${formatQtyLabel(displayQty)} ${symbol}`;
  if (receiptUom.conversionFactor === 1 || symbol === baseSymbol || !baseSymbol) {
    return primary;
  }
  return `${primary} (${formatQtyLabel(baseQty)} ${baseSymbol})`;
}

export function resolveReturnUomOptions(
  availableUoms: ReturnGrnUomOption[] | undefined,
  fallback: ReturnGrnUomOption,
): ReturnGrnUomOption[] {
  if (availableUoms && availableUoms.length > 0) {
    return availableUoms;
  }
  return [fallback];
}

export function findReturnUomOption(
  options: ReturnGrnUomOption[],
  uomId: string | undefined,
): ReturnGrnUomOption {
  return options.find((o) => o.uomId === uomId) ?? options[0];
}

/** Max enterable quantity in the selected UoM (from base returnable cap). */
export function maxReturnableInUom(returnableBase: number, factorToBase: number): number {
  return baseToUomQuantity(returnableBase, factorToBase);
}

/** Line value: purchase-UoM qty × purchase unit cost. */
export function returnGrnLineTotal(
  enteredQty: number,
  selectedFactor: number,
  purchaseFactor: number,
  unitCost: number,
): number {
  const baseQty = uomToBaseQuantity(enteredQty, selectedFactor);
  const purchaseQty = baseToUomQuantity(baseQty, purchaseFactor);
  return roundQty(purchaseQty * unitCost);
}
