/**
 * Unified UoM Conversion Utilities - Frontend
 * Handles both legacy and enhanced UoM systems with bank-grade precision
 */

import type { ProductWithUoMs, ProductUoM } from '../types';
import { roundMoney, multiplyMoney } from './precision';

// Re-export for convenience
export { convertToBaseUnit, calculatePriceForUoM } from './uomUtils';

/**
 * Product with simple UoM array structure
 */
export interface ProductWithUoMArray {
  id: string | number;
  name: string;
  baseUnit: string;  // Required field
  uoms?: Array<{
    name: string;
    conversionToBase: number;
    unitPrice?: number | null;
  }>;
  productUoMs?: ProductUoM[];
}

/**
 * Conversion result
 */
export interface ConversionResult {
  quantityInBaseUnits: number;
  originalQuantity: number;
  originalUnitName: string;
  baseUnitName: string;
  conversionFactor: number;
  unitPrice?: number;
}

/**
 * Convert to base units - Unified function for all UoM systems
 * 
 * Supports:
 * 1. Enhanced UoM system (ProductUoM with database IDs)
 * 2. Simple UoM array (name-based lookup)
 * 3. Fractional quantities (1.5 box = 36 pcs)
 * 
 * @param product - Product with UoM configuration
 * @param quantity - Quantity to convert (supports decimals)
 * @param uomNameOrId - UoM name (e.g., "box") or ID
 * @returns Conversion result with base unit quantity
 * 
 * @example
 * // Box to pieces
 * convertToBase(product, 1.5, "box")
 * // Returns: { quantityInBaseUnits: 36, ... } // 1.5 × 24 = 36 pcs
 * 
 * @example
 * // Half box to pieces
 * convertToBase(product, 2, "half_box")
 * // Returns: { quantityInBaseUnits: 24, ... } // 2 × 12 = 24 pcs
 * 
 * @example
 * // Pieces (base unit)
 * convertToBase(product, 10, "piece")
 * // Returns: { quantityInBaseUnits: 10, ... } // 10 × 1 = 10 pcs
 */
export function convertToBase(
  product: ProductWithUoMArray | ProductWithUoMs,
  quantity: number,
  uomNameOrId: string
): ConversionResult {
  // Validate product has baseUnit
  if (!product.baseUnit) {
    throw new Error(`Product "${product.name}" is missing baseUnit configuration`);
  }

  // Validate quantity
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than zero');
  }

  // Normalize input for case-insensitive matching
  const normalizedName = uomNameOrId.toLowerCase().trim();

  // OPTION 1: Try enhanced UoM system first (ProductUoM)
  if ('productUoMs' in product && product.productUoMs && product.productUoMs.length > 0) {
    // Try to find by UoM ID
    let productUoM = product.productUoMs.find(pu => pu.uomId === uomNameOrId);
    
    // If not found by ID, try by name or abbreviation
    if (!productUoM) {
      productUoM = product.productUoMs.find(
        pu =>
          pu.uom.name.toLowerCase() === normalizedName ||
          pu.uom.abbreviation.toLowerCase() === normalizedName
      );
    }

    if (productUoM) {
      const quantityInBaseUnits = quantity * productUoM.conversionFactor;
      
      return {
        quantityInBaseUnits,
        originalQuantity: quantity,
        originalUnitName: productUoM.uom.name,
        baseUnitName: product.baseUnit,
        conversionFactor: productUoM.conversionFactor,
        unitPrice: productUoM.unitPrice ?? undefined,
      };
    }
  }

  // OPTION 2: Try simple UoM array (name-based)
  if ('uoms' in product && product.uoms && product.uoms.length > 0) {
    const uom = product.uoms.find(
      u => u.name.toLowerCase() === normalizedName
    );

    if (uom) {
      const quantityInBaseUnits = quantity * uom.conversionToBase;
      
      return {
        quantityInBaseUnits,
        originalQuantity: quantity,
        originalUnitName: uom.name,
        baseUnitName: product.baseUnit,
        conversionFactor: uom.conversionToBase,
        unitPrice: uom.unitPrice ?? undefined,
      };
    }
  }

  // OPTION 3: Check if it's the base unit
  if (
    normalizedName === product.baseUnit.toLowerCase() ||
    normalizedName === 'base' ||
    normalizedName === 'piece' ||
    normalizedName === 'pcs'
  ) {
    return {
      quantityInBaseUnits: quantity,
      originalQuantity: quantity,
      originalUnitName: product.baseUnit,
      baseUnitName: product.baseUnit,
      conversionFactor: 1,
      unitPrice: undefined,
    };
  }

  // OPTION 4: Invalid UoM - throw descriptive error
  const availableUnits = [
    ...('productUoMs' in product && product.productUoMs ? product.productUoMs.map(pu => pu.uom.name) : []),
    ...('uoms' in product && product.uoms ? product.uoms.map(u => u.name) : []),
    product.baseUnit,
  ].filter((v, i, a) => a.indexOf(v) === i); // Remove duplicates

  throw new Error(
    `Invalid UoM "${uomNameOrId}" for product "${product.name}". ` +
    `Available units: ${availableUnits.join(', ')}`
  );
}

/**
 * Calculate total price for quantity in given UoM
 * Uses unitPrice if available, otherwise calculates from base price
 * 
 * @param product - Product with UoM configuration
 * @param quantity - Quantity in given UoM
 * @param uomNameOrId - UoM name or ID
 * @param basePrice - Base price per base unit (optional)
 * @returns Price calculation
 */
export function calculateUoMPrice(
  product: ProductWithUoMArray | ProductWithUoMs,
  quantity: number,
  uomNameOrId: string,
  basePrice?: number
): {
  unitPrice: number;
  totalPrice: number;
  quantity: number;
  unitName: string;
} {
  const conversion = convertToBase(product, quantity, uomNameOrId);

  // PRIORITY 1: Use manual unitPrice from ProductUoM if available
  if (conversion.unitPrice !== undefined && conversion.unitPrice !== null) {
    // Use bank-grade precision for currency calculations
    const unitPrice = roundMoney(conversion.unitPrice);
    const totalPrice = multiplyMoney(unitPrice, quantity);
    
    return {
      unitPrice,
      totalPrice,
      quantity,
      unitName: conversion.originalUnitName,
    };
  }

  // PRIORITY 2: Calculate from base price using conversion factor
  if (basePrice !== undefined) {
    // Unit price = base price × conversion factor
    const rawUnitPrice = basePrice * conversion.conversionFactor;
    const unitPrice = roundMoney(rawUnitPrice);
    const totalPrice = multiplyMoney(unitPrice, quantity);
    
    return {
      unitPrice,
      totalPrice,
      quantity,
      unitName: conversion.originalUnitName,
    };
  }

  throw new Error('No price information available for this UoM');
}

/**
 * Get all available UoMs for a product
 * @param product - Product with UoM configuration
 * @returns Array of available UoM names
 */
export function getAvailableUoMs(product: ProductWithUoMArray | ProductWithUoMs): string[] {
  if (!product.baseUnit) {
    return [];
  }
  
  const units: string[] = [product.baseUnit];

  if ('productUoMs' in product && product.productUoMs) {
    units.push(...product.productUoMs.map(pu => pu.uom.name));
  }

  if ('uoms' in product && product.uoms) {
    units.push(...product.uoms.map(u => u.name));
  }

  // Remove duplicates
  return [...new Set(units)];
}

/**
 * Validate UoM exists for product
 * @param product - Product with UoM configuration
 * @param uomNameOrId - UoM name or ID to validate
 * @returns True if valid, false otherwise
 */
export function isValidUoM(
  product: ProductWithUoMArray | ProductWithUoMs,
  uomNameOrId: string
): boolean {
  try {
    convertToBase(product, 1, uomNameOrId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format quantity with unit for display
 * @param quantity - Quantity value
 * @param unitName - Unit name
 * @returns Formatted string (e.g., "1.5 box", "24 pcs")
 */
export function formatQuantityWithUnit(quantity: number, unitName: string): string {
  // Round to 2 decimal places if needed
  const rounded = Math.round(quantity * 100) / 100;
  return `${rounded} ${unitName}`;
}

/**
 * Examples and test cases
 */
export const UoMExamples = {
  /**
   * Example product with box/half_box/piece UoMs
   */
  createExampleProduct(): ProductWithUoMArray {
    return {
      id: 'example-001',
      name: 'Example Product',
      baseUnit: 'piece',
      uoms: [
        {
          name: 'box',
          conversionToBase: 24, // 1 box = 24 pieces
          unitPrice: 240, // $240 per box
        },
        {
          name: 'half_box',
          conversionToBase: 12, // 1 half_box = 12 pieces
          unitPrice: 125, // $125 per half box
        },
        {
          name: 'piece',
          conversionToBase: 1, // 1 piece = 1 piece
          unitPrice: 10, // $10 per piece
        },
      ],
    };
  },

  /**
   * Test fractional conversions
   */
  testFractionalConversions() {
    const product = this.createExampleProduct();

    // 1.5 boxes = 36 pieces
    const result1 = convertToBase(product, 1.5, 'box');
    console.assert(
      result1.quantityInBaseUnits === 36,
      '1.5 boxes should equal 36 pieces'
    );

    // 2.5 half_boxes = 30 pieces
    const result2 = convertToBase(product, 2.5, 'half_box');
    console.assert(
      result2.quantityInBaseUnits === 30,
      '2.5 half_boxes should equal 30 pieces'
    );

    // 0.5 box = 12 pieces
    const result3 = convertToBase(product, 0.5, 'box');
    console.assert(
      result3.quantityInBaseUnits === 12,
      '0.5 box should equal 12 pieces'
    );

    console.log('✅ All fractional conversion tests passed!');
  },
};
