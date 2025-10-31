import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../config/database.js';

/**
 * Enhanced Unit of Measure Service
 * High-precision conversion and validation for multi-UoM system
 */

export interface ProductWithUoM {
  id: string;
  baseUnit: string;
  productUoMs?: Array<{
    id: string;
    uomId: string;
    conversionFactor: Decimal;
    priceMultiplier: Decimal;
    unitPrice?: Decimal | null;
    isDefault: boolean;
    isSaleAllowed: boolean;
    isPurchaseAllowed: boolean;
    uom: {
      id: string;
      name: string;
      abbreviation: string;
      conversionFactor: Decimal;
      isBase: boolean;
    };
  }>;
}

export interface UoMConversionResult {
  quantityInBaseUnit: Decimal;
  unit: string;
  unitId: string;
  conversionFactor: Decimal;
  priceMultiplier: Decimal;
}

export interface UoMPriceCalculation {
  unitPrice: Decimal;
  total: Decimal;
  priceMultiplier: Decimal;
  basePrice: Decimal;
}

/**
 * Convert quantity from given UoM to base unit
 * @param product - Product with UoM associations
 * @param quantity - Quantity in the given UoM
 * @param uomId - UoM ID to convert from
 * @returns Conversion result with quantity in base units
 */
export async function convertToBaseUnit(
  product: ProductWithUoM,
  quantity: Decimal | number,
  uomId: string
): Promise<UoMConversionResult> {
  const qty = new Decimal(quantity);

  // Validate quantity
  if (qty.lte(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  // Find the ProductUoM association
  const productUoM = product.productUoMs?.find(pu => pu.uomId === uomId);
  
  if (!productUoM) {
    throw new Error(`UoM not allowed for this product. Product ID: ${product.id}, UoM ID: ${uomId}`);
  }

  // Validate for sale operations
  if (!productUoM.isSaleAllowed) {
    throw new Error(`UoM "${productUoM.uom.name}" is not allowed for sales`);
  }

  // Convert to base unit using high-precision multiplication
  const quantityInBaseUnit = qty.mul(productUoM.conversionFactor);

  return {
    quantityInBaseUnit,
    unit: productUoM.uom.name,
    unitId: productUoM.uomId,
    conversionFactor: productUoM.conversionFactor,
    priceMultiplier: productUoM.priceMultiplier,
  };
}

/**
 * Convert quantity from base unit to target UoM
 * @param product - Product with UoM associations
 * @param quantityInBaseUnit - Quantity in base units
 * @param uomId - Target UoM ID
 * @returns Quantity in target UoM
 */
export async function convertFromBaseUnit(
  product: ProductWithUoM,
  quantityInBaseUnit: Decimal | number,
  uomId: string
): Promise<Decimal> {
  const qty = new Decimal(quantityInBaseUnit);

  // Find the ProductUoM association
  const productUoM = product.productUoMs?.find(pu => pu.uomId === uomId);
  
  if (!productUoM) {
    throw new Error(`UoM not allowed for this product. Product ID: ${product.id}, UoM ID: ${uomId}`);
  }

  // Convert from base unit using high-precision division
  return qty.div(productUoM.conversionFactor);
}

/**
 * Calculate price for given UoM and quantity
 * @param basePrice - Base price per base unit
 * @param quantity - Quantity in the given UoM
 * @param uomId - UoM ID
 * @param product - Product with UoM associations
 * @returns Price calculation result
 */
export async function calculatePriceForUoM(
  basePrice: Decimal | number,
  quantity: Decimal | number,
  uomId: string,
  product: ProductWithUoM
): Promise<UoMPriceCalculation> {
  const price = new Decimal(basePrice);
  const qty = new Decimal(quantity);

  // Find the ProductUoM association
  const productUoM = product.productUoMs?.find(pu => pu.uomId === uomId);
  
  if (!productUoM) {
    throw new Error(`UoM not allowed for this product. Product ID: ${product.id}, UoM ID: ${uomId}`);
  }

  // ENHANCED LOGIC: Use unitPrice if manually set, otherwise calculate
  let unitPrice: Decimal;
  
  if (productUoM.unitPrice !== null && productUoM.unitPrice !== undefined) {
    // Use the manually set price for this UoM
    unitPrice = new Decimal(productUoM.unitPrice);
  } else {
    // Fallback to calculated price using multiplier
    // Unit price = (base price per base unit) × conversion factor × price multiplier
    unitPrice = price.mul(productUoM.conversionFactor).mul(productUoM.priceMultiplier);
  }
  
  // Calculate total
  const total = unitPrice.mul(qty);

  return {
    unitPrice,
    total,
    priceMultiplier: productUoM.priceMultiplier,
    basePrice: price,
  };
}

/**
 * Get all allowed UoMs for a product with conversion ratios
 * @param productId - Product ID
 * @param saleOnly - If true, return only sale-allowed UoMs
 * @returns Array of allowed UoMs with metadata
 */
export async function getAllowedUoMs(
  productId: string,
  saleOnly: boolean = false
): Promise<Array<{
  id: string;
  name: string;
  abbreviation: string;
  conversionFactor: Decimal;
  priceMultiplier: Decimal;
  isDefault: boolean;
  barcode: string | null;
}>> {
  const productUoMs = await prisma.productUoM.findMany({
    where: {
      productId,
      ...(saleOnly ? { isSaleAllowed: true } : {}),
    },
    include: {
      uom: true,
    },
    orderBy: [
      { isDefault: 'desc' },
      { sortOrder: 'asc' },
      { uom: { name: 'asc' } },
    ],
  });

  return productUoMs.map((pu: any) => ({
    id: pu.uomId,
    name: pu.uom.name,
    abbreviation: pu.uom.abbreviation,
    conversionFactor: pu.conversionFactor,
    priceMultiplier: pu.priceMultiplier,
    isDefault: pu.isDefault,
    barcode: pu.barcode,
  }));
}

/**
 * Get default UoM for a product
 * @param productId - Product ID
 * @returns Default UoM or first available UoM
 */
export async function getDefaultUoM(productId: string): Promise<string | null> {
  const productUoM = await prisma.productUoM.findFirst({
    where: {
      productId,
      isDefault: true,
      isSaleAllowed: true,
    },
    select: {
      uomId: true,
    },
  });

  if (productUoM) {
    return productUoM.uomId;
  }

  // If no default, return first sale-allowed UoM
  const firstUoM = await prisma.productUoM.findFirst({
    where: {
      productId,
      isSaleAllowed: true,
    },
    select: {
      uomId: true,
    },
    orderBy: {
      sortOrder: 'asc',
    },
  });

  return firstUoM?.uomId || null;
}

/**
 * Validate UoM belongs to product and is allowed for operation
 * @param productId - Product ID
 * @param uomId - UoM ID
 * @param operationType - 'SALE' | 'PURCHASE'
 * @returns true if valid, throws error otherwise
 */
export async function validateUoMForProduct(
  productId: string,
  uomId: string,
  operationType: 'SALE' | 'PURCHASE'
): Promise<boolean> {
  const productUoM = await prisma.productUoM.findUnique({
    where: {
      productId_uomId: {
        productId,
        uomId,
      },
    },
    include: {
      uom: {
        select: {
          name: true,
        },
      },
    },
  });

  if (!productUoM) {
    throw new Error(`UoM is not associated with this product`);
  }

  if (operationType === 'SALE' && !productUoM.isSaleAllowed) {
    throw new Error(`UoM "${productUoM.uom.name}" is not allowed for sales`);
  }

  if (operationType === 'PURCHASE' && !productUoM.isPurchaseAllowed) {
    throw new Error(`UoM "${productUoM.uom.name}" is not allowed for purchases`);
  }

  return true;
}

/**
 * Auto-suggest optimal UoM for large quantities
 * @param product - Product with UoM associations
 * @param quantityInBaseUnit - Quantity in base units
 * @returns Suggested UoM ID and converted quantity
 */
export async function suggestOptimalUoM(
  product: ProductWithUoM,
  quantityInBaseUnit: Decimal | number
): Promise<{
  uomId: string;
  quantity: Decimal;
  name: string;
  abbreviation: string;
} | null> {
  const qty = new Decimal(quantityInBaseUnit);

  if (!product.productUoMs || product.productUoMs.length === 0) {
    return null;
  }

  // Sort by conversion factor (largest first)
  const sortedUoMs = [...product.productUoMs]
    .filter(pu => pu.isSaleAllowed)
    .sort((a, b) => b.conversionFactor.cmp(a.conversionFactor));

  // Find the largest UoM where quantity >= 1
  for (const pu of sortedUoMs) {
    const convertedQty = qty.div(pu.conversionFactor);
    if (convertedQty.gte(1)) {
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
      quantity: qty.div(smallestUoM.conversionFactor),
      name: smallestUoM.uom.name,
      abbreviation: smallestUoM.uom.abbreviation,
    };
  }

  return null;
}

/**
 * Batch convert multiple items to base units
 * @param items - Array of items with product, quantity, and uomId
 * @returns Array of conversion results
 */
export async function batchConvertToBaseUnit(
  items: Array<{
    product: ProductWithUoM;
    quantity: Decimal | number;
    uomId: string;
  }>
): Promise<UoMConversionResult[]> {
  const results: UoMConversionResult[] = [];

  for (const item of items) {
    const result = await convertToBaseUnit(item.product, item.quantity, item.uomId);
    results.push(result);
  }

  return results;
}
