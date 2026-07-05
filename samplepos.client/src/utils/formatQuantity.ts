/**
 * Shared utility for formatting product quantities with multi-UOM breakdown
 * Used consistently across all product displays: Stock Levels, Product History, Goods Receipts, etc.
 * 
 * Example outputs:
 * - "7 BOX + 22.00 btl" (190 base units with BOX × 24)
 * - "5 BOX + 4.00 base" (64 base units with BOX × 12)
 * - "10.00 PCS" (no UOMs defined)
 */

export interface ProductUomEntry {
  conversionFactor: number;
  isDefault?: boolean;
  uomSymbol?: string;
  uom_symbol?: string;
  uomName?: string;
  uom_name?: string;
  name?: string;
  symbol?: string;
}

export interface ProductWithUoms {
  product_uoms?: ProductUomEntry[];
  productUoms?: ProductUomEntry[];
  unitOfMeasure?: string;
}

/** Normalize UoM JSON from stock-level / warehouse API rows. */
export function normalizeApiUoms(uoms: unknown): ProductUomEntry[] {
  if (!uoms) return [];
  const raw = typeof uoms === 'string' ? (JSON.parse(uoms) as unknown) : uoms;
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const row = entry as Record<string, unknown>;
    return {
      conversionFactor: Number(row.conversionFactor ?? row.conversion_factor ?? 1),
      isDefault: Boolean(row.isDefault ?? row.is_default),
      uomSymbol: String(row.symbol ?? row.uomSymbol ?? row.uom_symbol ?? ''),
      uomName: String(row.name ?? row.uomName ?? row.uom_name ?? ''),
      name: String(row.name ?? ''),
      symbol: String(row.symbol ?? ''),
    };
  });
}

/** Build a product-shaped object for formatMultiUomQuantity from API `uoms` JSON. */
export function productFromApiUoms(uoms: unknown, fallbackUnit = 'PCS'): ProductWithUoms {
  const productUoms = normalizeApiUoms(uoms);
  const base =
    productUoms.find((u) => u.isDefault) ??
    [...productUoms].sort((a, b) => a.conversionFactor - b.conversionFactor)[0];
  const unitOfMeasure =
    base?.uomSymbol || base?.symbol || base?.uomName || base?.name || fallbackUnit;
  return { productUoms, unitOfMeasure };
}

/** Short label for matrix headers — e.g. "BOX (×12) + PCS". */
export function formatUomSummary(uoms: unknown, maxUnits = 3): string {
  const list = normalizeApiUoms(uoms);
  if (list.length === 0) return 'PCS';
  const sorted = [...list].sort((a, b) => b.conversionFactor - a.conversionFactor);
  const parts = sorted.slice(0, maxUnits).map((u) => {
    const label = u.uomSymbol || u.symbol || u.uomName || u.name || 'UOM';
    return u.conversionFactor > 1 ? `${label} (×${u.conversionFactor})` : label;
  });
  return parts.join(' · ');
}

/**
 * Format a quantity with multi-UOM breakdown (e.g., "7 BOX + 22.00 btl")
 * This is the CANONICAL implementation used across the entire application
 * 
 * @param totalQty - Total quantity in base units
 * @param product - Product object with productUoms array
 * @returns Formatted string like "7 BOX + 22.00 btl" or "190.00 btl"
 */
export function formatMultiUomQuantity(totalQty: number, product: ProductWithUoms | null | undefined): string {
  if (!product) {
    return `${totalQty.toFixed(2)}`;
  }

  // Get product UOMs if available
  const productUoms = product.product_uoms || product.productUoms || [];

  if (!productUoms || productUoms.length === 0) {
    const baseUom = product.unitOfMeasure || 'PCS';
    return `${totalQty.toFixed(2)} ${baseUom}`;
  }

  // Sort UOMs by conversion factor (descending) to show largest units first
  const sortedUoms = [...productUoms]
    .filter((uom) => uom.conversionFactor > 1)
    .sort((a, b) => b.conversionFactor - a.conversionFactor);

  if (sortedUoms.length === 0) {
    // Only base unit exists
    const baseUom = productUoms.find((u) => u.isDefault) || productUoms[0];
    const uomSymbol = baseUom?.uomSymbol || baseUom?.uom_symbol || baseUom?.uomName || baseUom?.uom_name || 'PC';
    return `${totalQty.toFixed(2)} ${uomSymbol}`;
  }

  // Calculate breakdown
  let remainingQty = totalQty;
  const breakdown: string[] = [];

  for (const uom of sortedUoms) {
    const conversionFactor = uom.conversionFactor;
    if (remainingQty >= conversionFactor) {
      const units = Math.floor(remainingQty / conversionFactor);
      remainingQty = remainingQty % conversionFactor;
      const uomSymbol = uom.uomSymbol || uom.uom_symbol || uom.uomName || uom.uom_name || '';
      breakdown.push(`${units} ${uomSymbol}`);
    }
  }

  // Add remaining base units - find the TRUE base unit (smallest conversion factor)
  if (remainingQty > 0 || breakdown.length === 0) {
    // Sort to find the smallest conversion factor (the true base unit)
    const sortedBySmallest = [...productUoms].sort((a, b) =>
      (a.conversionFactor || 1) - (b.conversionFactor || 1)
    );
    const trueBaseUom = sortedBySmallest[0];
    const baseSymbol = trueBaseUom?.uomSymbol || trueBaseUom?.uom_symbol || trueBaseUom?.uomName || trueBaseUom?.uom_name || 'PC';
    breakdown.push(`${remainingQty.toFixed(2)} ${baseSymbol}`);
  }

  return breakdown.join(' + ');
}
