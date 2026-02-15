/**
 * Shared utility for formatting product quantities with multi-UOM breakdown
 * Used consistently across all product displays: Stock Levels, Product History, Goods Receipts, etc.
 * 
 * Example outputs:
 * - "7 BOX + 22.00 btl" (190 base units with BOX × 24)
 * - "5 BOX + 4.00 base" (64 base units with BOX × 12)
 * - "10.00 PCS" (no UOMs defined)
 */

/**
 * Format a quantity with multi-UOM breakdown (e.g., "7 BOX + 22.00 btl")
 * This is the CANONICAL implementation used across the entire application
 * 
 * @param totalQty - Total quantity in base units
 * @param product - Product object with productUoms array
 * @returns Formatted string like "7 BOX + 22.00 btl" or "190.00 btl"
 */
export function formatMultiUomQuantity(totalQty: number, product: any): string {
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
    .filter((uom: any) => uom.conversionFactor > 1)
    .sort((a: any, b: any) => parseFloat(b.conversionFactor) - parseFloat(a.conversionFactor));

  if (sortedUoms.length === 0) {
    // Only base unit exists
    const baseUom = productUoms.find((u: any) => u.isDefault) || productUoms[0];
    const uomSymbol = baseUom?.uomSymbol || baseUom?.uom_symbol || baseUom?.uomName || baseUom?.uom_name || 'PC';
    return `${totalQty.toFixed(2)} ${uomSymbol}`;
  }

  // Calculate breakdown
  let remainingQty = totalQty;
  const breakdown: string[] = [];

  for (const uom of sortedUoms) {
    const conversionFactor = parseFloat(uom.conversionFactor);
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
    const sortedBySmallest = [...productUoms].sort((a: any, b: any) => 
      parseFloat(a.conversionFactor || 1) - parseFloat(b.conversionFactor || 1)
    );
    const trueBaseUom = sortedBySmallest[0];
    const baseSymbol = trueBaseUom?.uomSymbol || trueBaseUom?.uom_symbol || trueBaseUom?.uomName || trueBaseUom?.uom_name || 'PC';
    breakdown.push(`${remainingQty.toFixed(2)} ${baseSymbol}`);
  }

  return breakdown.join(' + ');
}
