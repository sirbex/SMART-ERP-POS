/**
 * MUoM helpers for sale line items (returns, exchanges, credit notes).
 * sale_items.quantity and refunded_qty are always in the **selling UoM**.
 * inventory_batches / stock_movements use **base UoM** (quantity × conversionFactor).
 */

export function saleItemConversionFactor(
  factor: number | string | null | undefined,
): number {
  const n = typeof factor === 'string' ? parseFloat(factor) : (factor ?? 1);
  if (!Number.isFinite(n) || n <= 0) return 1;
  return n;
}

/** Convert selling-unit quantity to base-unit quantity. */
export function sellingQtyToBase(
  sellingQty: number,
  conversionFactor: number | string | null | undefined,
): number {
  const cf = saleItemConversionFactor(conversionFactor);
  const base = sellingQty * cf;
  return Number.isFinite(base) ? base : sellingQty;
}

export function formatQtyForDisplay(qty: number, maxDecimals = 4): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 10 ** maxDecimals) / 10 ** maxDecimals;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(maxDecimals).replace(/\.?0+$/, '');
}

/** Human label for the selling UoM (symbol preferred). */
export function sellingUomLabel(
  uomSymbol?: string | null,
  uomName?: string | null,
): string {
  const sym = (uomSymbol ?? '').trim();
  if (sym) return sym;
  const name = (uomName ?? '').trim();
  if (name) return name;
  return 'unit';
}

/**
 * e.g. "2 BOX (= 24 PC)" when conversionFactor > 1, else "5 PC"
 */
export function formatSellingQuantityWithBaseHint(
  sellingQty: number,
  options: {
    uomSymbol?: string | null;
    uomName?: string | null;
    baseUomSymbol?: string | null;
    conversionFactor?: number | string | null;
  },
): string {
  const label = sellingUomLabel(options.uomSymbol, options.uomName);
  const qtyStr = formatQtyForDisplay(sellingQty);
  const cf = saleItemConversionFactor(options.conversionFactor);
  if (cf > 1.001) {
    const baseLabel = sellingUomLabel(options.baseUomSymbol, 'base');
    const baseQty = formatQtyForDisplay(sellingQtyToBase(sellingQty, cf));
    return `${qtyStr} ${label} (= ${baseQty} ${baseLabel})`;
  }
  return `${qtyStr} ${label}`;
}
