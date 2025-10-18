import { Decimal } from '@prisma/client/runtime/library';

export interface Product {
  baseUnit: string;
  hasMultipleUnits: boolean;
  alternateUnit: string | null;
  conversionFactor: Decimal | null;
}

/**
 * Convert quantity from given unit to base unit
 * @param product - Product with UOM settings
 * @param quantity - Quantity in given unit
 * @param unit - Unit type: "base" or "alternate"
 * @returns Quantity in base units
 */
export function convertToBaseUnit(
  product: Product,
  quantity: Decimal | number,
  unit: string
): Decimal {
  const qty = new Decimal(quantity);

  if (unit === 'base' || !product.hasMultipleUnits) {
    return qty;
  }

  if (unit === 'alternate' && product.conversionFactor) {
    return qty.mul(product.conversionFactor);
  }

  throw new Error(`Invalid unit: ${unit} for product`);
}

/**
 * Convert quantity from base unit to target unit
 * @param product - Product with UOM settings
 * @param quantity - Quantity in base units
 * @param targetUnit - Target unit: "base" or "alternate"
 * @returns Quantity in target unit
 */
export function convertFromBaseUnit(
  product: Product,
  quantity: Decimal | number,
  targetUnit: string
): Decimal {
  const qty = new Decimal(quantity);

  if (targetUnit === 'base' || !product.hasMultipleUnits) {
    return qty;
  }

  if (targetUnit === 'alternate' && product.conversionFactor) {
    return qty.div(product.conversionFactor);
  }

  throw new Error(`Invalid unit: ${targetUnit} for product`);
}

/**
 * Get unit label for display
 */
export function getUnitLabel(product: Product, unit: string): string {
  if (unit === 'base') {
    return product.baseUnit;
  }
  if (unit === 'alternate' && product.alternateUnit) {
    return product.alternateUnit;
  }
  return product.baseUnit;
}
