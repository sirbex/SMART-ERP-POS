/**
 * Unit of Measure (UoM) Utility Functions
 * Client-side conversion and price calculation for UoM system
 */

import type {
  ProductWithUoMs,
  ProductUoM,
  AllowedUoM,
  UoMConversionResult,
  UoMPriceCalculation,
} from '../types';
import {
  convertToBase as unifiedConvertToBase,
  calculateUoMPrice as unifiedCalculatePrice,
} from './uomUnifiedConverter';

/**
 * Convert quantity from given UoM to base units
 * ENHANCED: Now uses unified converter for accuracy
 * @param product - Product with UoM associations
 * @param quantity - Quantity in the given UoM
 * @param uomId - UoM ID to convert from
 * @returns Conversion result with quantity in base units
 */
export function convertToBaseUnit(
  product: ProductWithUoMs,
  quantity: number,
  uomId: string
): UoMConversionResult {
  const result = unifiedConvertToBase(product, quantity, uomId);
  
  return {
    quantityInBaseUnit: result.quantityInBaseUnits,
    unit: result.originalUnitName,
    unitId: uomId,
    conversionFactor: result.conversionFactor,
    priceMultiplier: 1, // Legacy field
  };
}

/**
 * Convert quantity from base units to target UoM
 * @param product - Product with UoM associations
 * @param quantityInBaseUnit - Quantity in base units
 * @param uomId - Target UoM ID
 * @returns Quantity in target UoM
 */
export function convertFromBaseUnit(
  product: ProductWithUoMs,
  quantityInBaseUnit: number,
  uomId: string
): number {
  const productUoM = product.productUoMs?.find(pu => pu.uomId === uomId);
  
  if (!productUoM) {
    throw new Error(`UoM not allowed for this product`);
  }

  return quantityInBaseUnit / productUoM.conversionFactor;
}

/**
 * Calculate price for given UoM and quantity
 * ENHANCED: Uses manually set unitPrice if available, otherwise calculates
 * Now leverages unified converter for accuracy
 * @param basePrice - Base price per base unit
 * @param quantity - Quantity in the given UoM
 * @param uomId - UoM ID
 * @param product - Product with UoM associations
 * @returns Price calculation result
 */
export function calculatePriceForUoM(
  basePrice: number,
  quantity: number,
  uomId: string,
  product: ProductWithUoMs
): UoMPriceCalculation {
  try {
    // Use unified converter for accurate calculation
    const priceCalc = unifiedCalculatePrice(product, quantity, uomId, basePrice);
    
    return {
      unitPrice: priceCalc.unitPrice,
      total: priceCalc.totalPrice,
    priceMultiplier: productUoM.priceMultiplier,
    basePrice,
  };
}

/**
 * Get default UoM for a product
 * @param product - Product with UoM associations
 * @returns Default UoM ID or null
 */
export function getDefaultUoM(product: ProductWithUoMs): string | null {
  if (!product.productUoMs || product.productUoMs.length === 0) {
    return null;
  }

  const defaultUoM = product.productUoMs.find(pu => pu.isDefault && pu.isSaleAllowed);
  if (defaultUoM) {
    return defaultUoM.uomId;
  }

  // If no default, return first sale-allowed UoM
  const firstAllowed = product.productUoMs
    .filter(pu => pu.isSaleAllowed)
    .sort((a, b) => a.sortOrder - b.sortOrder)[0];
  
  return firstAllowed?.uomId || null;
}

/**
 * Get allowed UoMs for sale
 * @param product - Product with UoM associations
 * @returns Array of allowed UoMs
 */
export function getAllowedUoMs(product: ProductWithUoMs): AllowedUoM[] {
  if (!product.productUoMs || product.productUoMs.length === 0) {
    return [];
  }

  return product.productUoMs
    .filter(pu => pu.isSaleAllowed)
    .sort((a, b) => {
      // Sort by default first, then by sortOrder
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.sortOrder - b.sortOrder;
    })
    .map(pu => ({
      id: pu.uomId,
      name: pu.uom.name,
      abbreviation: pu.uom.abbreviation,
      conversionFactor: pu.conversionFactor,
      priceMultiplier: pu.priceMultiplier,
      isDefault: pu.isDefault,
      barcode: pu.barcode || undefined,
    }));
}

/**
 * Format UoM display name
 * @param uom - UoM object
 * @param showAbbreviation - Whether to show abbreviation in parentheses
 * @returns Formatted display name
 */
export function formatUoMDisplayName(
  uom: { name: string; abbreviation: string },
  showAbbreviation: boolean = true
): string {
  if (showAbbreviation) {
    return `${uom.name} (${uom.abbreviation})`;
  }
  return uom.name;
}

/**
 * Format quantity with UoM
 * @param quantity - Quantity value
 * @param uom - UoM object
 * @param decimals - Number of decimal places
 * @returns Formatted string like "5.5 kg"
 */
export function formatQuantityWithUoM(
  quantity: number,
  uom: { name?: string; abbreviation: string },
  decimals: number = 2
): string {
  const formattedQty = quantity.toFixed(decimals).replace(/\.?0+$/, '');
  return `${formattedQty} ${uom.abbreviation}`;
}

/**
 * Calculate price per UoM for display
 * @param basePrice - Base price per base unit
 * @param productUoM - ProductUoM association
 * @returns Price per this UoM
 */
export function calculateDisplayPrice(
  basePrice: number,
  productUoM: ProductUoM
): number {
  return basePrice * productUoM.conversionFactor * productUoM.priceMultiplier;
}

/**
 * Suggest optimal UoM for large quantities
 * @param product - Product with UoM associations
 * @param quantityInBaseUnit - Quantity in base units
 * @returns Suggested UoM and converted quantity, or null
 */
export function suggestOptimalUoM(
  product: ProductWithUoMs,
  quantityInBaseUnit: number
): { uomId: string; quantity: number; name: string; abbreviation: string } | null {
  if (!product.productUoMs || product.productUoMs.length === 0) {
    return null;
  }

  // Sort by conversion factor (largest first)
  const sortedUoMs = [...product.productUoMs]
    .filter(pu => pu.isSaleAllowed)
    .sort((a, b) => b.conversionFactor - a.conversionFactor);

  // Find the largest UoM where quantity >= 1
  for (const pu of sortedUoMs) {
    const convertedQty = quantityInBaseUnit / pu.conversionFactor;
    if (convertedQty >= 1) {
      return {
        uomId: pu.uomId,
        quantity: convertedQty,
        name: pu.uom.name,
        abbreviation: pu.uom.abbreviation,
      };
    }
  }

  // If no suitable UoM found, return the smallest (base) UoM
  const smallestUoM = sortedUoMs[sortedUoMs.length - 1];
  if (smallestUoM) {
    return {
      uomId: smallestUoM.uomId,
      quantity: quantityInBaseUnit / smallestUoM.conversionFactor,
      name: smallestUoM.uom.name,
      abbreviation: smallestUoM.uom.abbreviation,
    };
  }

  return null;
}

/**
 * Validate UoM for product
 * @param product - Product with UoM associations
 * @param uomId - UoM ID to validate
 * @returns True if valid, throws error otherwise
 */
export function validateUoMForProduct(
  product: ProductWithUoMs,
  uomId: string
): boolean {
  const productUoM = product.productUoMs?.find(pu => pu.uomId === uomId);
  
  if (!productUoM) {
    throw new Error('UoM is not associated with this product');
  }

  if (!productUoM.isSaleAllowed) {
    throw new Error(`UoM "${productUoM.uom.name}" is not allowed for sales`);
  }

  return true;
}

/**
 * Check if product has UoM system enabled
 * @param product - Product to check
 * @returns True if product has UoMs configured
 */
export function hasUoMSystem(product: ProductWithUoMs): boolean {
  return !!product.productUoMs && product.productUoMs.length > 0;
}

/**
 * Get UoM by ID from product
 * @param product - Product with UoM associations
 * @param uomId - UoM ID
 * @returns ProductUoM or undefined
 */
export function getProductUoMById(
  product: ProductWithUoMs,
  uomId: string
): ProductUoM | undefined {
  return product.productUoMs?.find(pu => pu.uomId === uomId);
}

/**
 * Format price with UoM for display
 * @param price - Price value
 * @param uom - UoM object
 * @param currency - Currency symbol
 * @returns Formatted string like "$5.50 / kg"
 */
export function formatPriceWithUoM(
  price: number,
  uom: { abbreviation: string },
  currency: string = '$'
): string {
  return `${currency}${price.toFixed(2)} / ${uom.abbreviation}`;
}
