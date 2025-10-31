import { Decimal } from '@prisma/client/runtime/library';
import { convertToBaseUnit as enhancedConvertToBase } from './uomService.js';

/**
 * Unified UoM Conversion Utilities
 * Handles both legacy and enhanced UoM systems with high precision
 */

/**
 * Product with UoM array structure
 * Supports: box = 24 pcs, half_box = 12 pcs, piece = 1
 */
export interface ProductWithUoMArray {
  id: string;
  name: string;
  baseUnit: string;
  uoms?: Array<{
    name: string;
    conversionToBase: number | Decimal;
    unitPrice?: number | Decimal | null;
  }>;
  productUoMs?: Array<{
    id: string;
    uomId: string;
    conversionFactor: Decimal;
    unitPrice?: Decimal | null;
    uom: {
      id: string;
      name: string;
      abbreviation: string;
    };
  }>;
}

/**
 * Conversion result with high precision
 */
export interface ConversionResult {
  quantityInBaseUnits: Decimal;
  originalQuantity: Decimal;
  originalUnitName: string;
  baseUnitName: string;
  conversionFactor: Decimal;
  unitPrice?: Decimal;
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
  product: ProductWithUoMArray,
  quantity: number | Decimal,
  uomNameOrId: string
): ConversionResult {
  // High-precision quantity
  const qty = new Decimal(quantity);

  // Validate quantity
  if (qty.lte(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  // Normalize input for case-insensitive matching
  const normalizedName = uomNameOrId.toLowerCase().trim();

  // OPTION 1: Try enhanced UoM system first (ProductUoM)
  if (product.productUoMs && product.productUoMs.length > 0) {
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
      const quantityInBaseUnits = qty.mul(productUoM.conversionFactor);
      
      return {
        quantityInBaseUnits,
        originalQuantity: qty,
        originalUnitName: productUoM.uom.name,
        baseUnitName: product.baseUnit,
        conversionFactor: productUoM.conversionFactor,
        unitPrice: productUoM.unitPrice ?? undefined,
      };
    }
  }

  // OPTION 2: Try simple UoM array (name-based)
  if (product.uoms && product.uoms.length > 0) {
    const uom = product.uoms.find(
      u => u.name.toLowerCase() === normalizedName
    );

    if (uom) {
      const conversionFactor = new Decimal(uom.conversionToBase);
      const quantityInBaseUnits = qty.mul(conversionFactor);
      
      return {
        quantityInBaseUnits,
        originalQuantity: qty,
        originalUnitName: uom.name,
        baseUnitName: product.baseUnit,
        conversionFactor,
        unitPrice: uom.unitPrice ? new Decimal(uom.unitPrice) : undefined,
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
      quantityInBaseUnits: qty,
      originalQuantity: qty,
      originalUnitName: product.baseUnit,
      baseUnitName: product.baseUnit,
      conversionFactor: new Decimal(1),
      unitPrice: undefined,
    };
  }

  // OPTION 4: Invalid UoM - throw descriptive error
  const availableUnits = [
    ...(product.productUoMs?.map(pu => pu.uom.name) || []),
    ...(product.uoms?.map(u => u.name) || []),
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
 * @returns Price calculation with precision
 */
export function calculateUoMPrice(
  product: ProductWithUoMArray,
  quantity: number | Decimal,
  uomNameOrId: string,
  basePrice?: number | Decimal
): {
  unitPrice: Decimal;
  totalPrice: Decimal;
  quantity: Decimal;
  unitName: string;
} {
  const conversion = convertToBase(product, quantity, uomNameOrId);
  const qty = new Decimal(quantity);

  // Use manual unitPrice if available
  if (conversion.unitPrice) {
    const totalPrice = conversion.unitPrice.mul(qty);
    return {
      unitPrice: conversion.unitPrice,
      totalPrice,
      quantity: qty,
      unitName: conversion.originalUnitName,
    };
  }

  // Calculate from base price
  if (basePrice) {
    const base = new Decimal(basePrice);
    const unitPrice = base.mul(conversion.conversionFactor);
    const totalPrice = unitPrice.mul(qty);
    
    return {
      unitPrice,
      totalPrice,
      quantity: qty,
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
export function getAvailableUoMs(product: ProductWithUoMArray): string[] {
  const units: string[] = [product.baseUnit];

  if (product.productUoMs) {
    units.push(...product.productUoMs.map(pu => pu.uom.name));
  }

  if (product.uoms) {
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
  product: ProductWithUoMArray,
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
   * Test fractional quantities
   */
  testFractionalConversions() {
    const product = this.createExampleProduct();

    // 1.5 boxes = 36 pieces
    const result1 = convertToBase(product, 1.5, 'box');
    console.assert(
      result1.quantityInBaseUnits.equals(36),
      '1.5 boxes should equal 36 pieces'
    );

    // 2.5 half_boxes = 30 pieces
    const result2 = convertToBase(product, 2.5, 'half_box');
    console.assert(
      result2.quantityInBaseUnits.equals(30),
      '2.5 half_boxes should equal 30 pieces'
    );

    // 0.5 box = 12 pieces
    const result3 = convertToBase(product, 0.5, 'box');
    console.assert(
      result3.quantityInBaseUnits.equals(12),
      '0.5 box should equal 12 pieces'
    );

    console.log('✅ All fractional conversion tests passed!');
  },
};
