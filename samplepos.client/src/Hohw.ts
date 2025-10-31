/**
 * Multi-Unit of Measure (UoM) Calculation Utilities
 *
 * Pure functions for unit conversions, cost calculations, and pricing
 * Uses Decimal.js for precise monetary calculations
 *
 * @module utils/multiUomCalculations
 */

import { Decimal } from 'decimal.js';
import type {
  BulkPurchaseConfig,
  BulkPurchaseResult,
  UnitConversionRequest,
  UnitConversionResult,
  AlternateUnit,
  UnitPrice,
} from '@/types/multiUom';

// Configure Decimal.js for monetary precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Convert quantity from one unit to another
 *
 * @example
 * convertUnits({ quantity: 2, fromUnit: 'box', toUnit: 'bottle', conversionRate: 24 })
 * // Returns: { convertedQuantity: 48, fromUnit: 'box', toUnit: 'bottle', originalQuantity: 2 }
 */
export function convertUnits(request: UnitConversionRequest): UnitConversionResult {
  if (request.conversionRate <= 0) {
    throw new Error('Conversion rate must be positive');
  }

  if (request.quantity < 0) {
    throw new Error('Quantity cannot be negative');
  }

  // Converting from alternate unit to base unit (e.g., box to bottle)
  if (request.fromUnit !== request.toUnit) {
    const convertedQuantity = request.quantity * request.conversionRate;

    return {
      convertedQuantity,
      fromUnit: request.fromUnit,
      toUnit: request.toUnit,
      originalQuantity: request.quantity,
    };
  }

  // Same unit, no conversion needed
  return {
    convertedQuantity: request.quantity,
    fromUnit: request.fromUnit,
    toUnit: request.toUnit,
    originalQuantity: request.quantity,
  };
}

/**
 * Calculate cost per base unit from bulk purchase
 *
 * @example
 * calculateCostPerBaseUnit(new Decimal(12), 24)
 * // Returns: Decimal(0.50) - $12 per box ÷ 24 bottles = $0.50 per bottle
 */
export function calculateCostPerBaseUnit(
  costPerPurchaseUnit: Decimal,
  unitsPerPurchaseUnit: number
): Decimal {
  if (unitsPerPurchaseUnit <= 0) {
    throw new Error('Units per purchase unit must be positive');
  }

  return costPerPurchaseUnit.dividedBy(unitsPerPurchaseUnit);
}

/**
 * Calculate suggested selling price with markup
 *
 * @example
 * calculateSellingPrice(new Decimal(0.50), 25)
 * // Returns: Decimal(0.625) - $0.50 cost + 25% markup = $0.625
 */
export function calculateSellingPrice(costPrice: Decimal, markupPercentage: number): Decimal {
  if (markupPercentage < 0) {
    throw new Error('Markup percentage cannot be negative');
  }

  const markup = new Decimal(markupPercentage).dividedBy(100);
  return costPrice.times(new Decimal(1).plus(markup));
}

/**
 * Calculate selling price for alternate unit based on base unit price
 *
 * @example
 * calculateAlternateUnitPrice(new Decimal(0.63), 24)
 * // Returns: Decimal(15.12) - $0.63 per bottle × 24 = $15.12 per box
 */
export function calculateAlternateUnitPrice(
  basePricePerUnit: Decimal,
  conversionRate: number
): Decimal {
  if (conversionRate <= 0) {
    throw new Error('Conversion rate must be positive');
  }

  return basePricePerUnit.times(conversionRate);
}

/**
 * Perform complete bulk purchase calculation
 * Calculates costs, suggested prices, and profit margins
 *
 * @example
 * calculateBulkPurchase({
 *   productName: 'Coca Cola',
 *   baseUnit: 'bottle',
 *   purchaseUnit: 'box',
 *   unitsPerPurchaseUnit: 24,
 *   costPerPurchaseUnit: new Decimal(12),
 *   quantity: 10,
 *   markupPercentage: 25,
 *   minimumSellingPrice: new Decimal(0.60)
 * })
 */
export function calculateBulkPurchase(config: BulkPurchaseConfig): BulkPurchaseResult {
  // Enhanced business logic validation
  if (config.unitsPerPurchaseUnit <= 0) {
    throw new Error('Units per purchase unit must be positive');
  }

  if (config.quantity <= 0) {
    throw new Error('Quantity must be positive');
  }

  if (config.costPerPurchaseUnit.lessThanOrEqualTo(0)) {
    throw new Error('Cost per purchase unit must be positive');
  }

  // Business rule: Warn about unusual conversion factors
  if (config.unitsPerPurchaseUnit > 1000) {
    console.warn(
      '⚠️ Large conversion factor detected:',
      config.unitsPerPurchaseUnit,
      'units per',
      config.purchaseUnit
    );
  }

  // Calculate cost per base unit
  const costPerBaseUnit = calculateCostPerBaseUnit(
    config.costPerPurchaseUnit,
    config.unitsPerPurchaseUnit
  );

  // Calculate total base units received
  const totalBaseUnits = config.quantity * config.unitsPerPurchaseUnit;

  // Business rule: Alert for large inventory additions
  if (totalBaseUnits > 10000) {
    console.warn(
      '⚠️ Large inventory addition:',
      totalBaseUnits,
      'units. Consider batch splitting.'
    );
  }

  // Calculate total cost
  const totalCost = config.costPerPurchaseUnit.times(config.quantity);

  // Enhanced pricing logic with business rules
  const markupPercentage = config.markupPercentage || 25; // Default 25% markup
  let suggestedPricePerBaseUnit = calculateSellingPrice(costPerBaseUnit, markupPercentage);

  // Business rule: Apply minimum selling price if specified
  if (
    config.minimumSellingPrice &&
    suggestedPricePerBaseUnit.lessThan(config.minimumSellingPrice)
  ) {
    console.log('📊 Minimum price constraint applied:', {
      calculatedPrice: suggestedPricePerBaseUnit.toFixed(4),
      minimumPrice: config.minimumSellingPrice.toFixed(4),
    });
    suggestedPricePerBaseUnit = config.minimumSellingPrice;
  }

  // Business rule: Prevent selling below cost (minimum 5% markup)
  const minimumViablePrice = costPerBaseUnit.times(1.05);
  if (suggestedPricePerBaseUnit.lessThan(minimumViablePrice)) {
    console.warn('⚠️ Price too low - adjusting to minimum viable price (5% above cost)');
    suggestedPricePerBaseUnit = minimumViablePrice;
  }

  // Calculate suggested price for purchase unit
  const suggestedPricePerPurchaseUnit = calculateAlternateUnitPrice(
    suggestedPricePerBaseUnit,
    config.unitsPerPurchaseUnit
  );

  // Calculate actual profit margin based on final price
  const profitPerBaseUnit = suggestedPricePerBaseUnit.minus(costPerBaseUnit);
  const profitMargin = profitPerBaseUnit.dividedBy(costPerBaseUnit).times(100);

  // Business rule: Log pricing analysis
  console.log('💰 Bulk Purchase Pricing Analysis:', {
    product: config.productName,
    costPerUnit: costPerBaseUnit.toFixed(4),
    sellingPerUnit: suggestedPricePerBaseUnit.toFixed(4),
    profitMargin: profitMargin.toFixed(2) + '%',
    totalInventoryValue: totalCost.toFixed(2),
    projectedRevenue: suggestedPricePerBaseUnit.times(totalBaseUnits).toFixed(2),
    projectedProfit: profitPerBaseUnit.times(totalBaseUnits).toFixed(2),
  });

  return {
    costPerBaseUnit,
    totalBaseUnits,
    totalCost,
    suggestedPricePerBaseUnit,
    suggestedPricePerPurchaseUnit,
    profitMargin,
  };
}

/**
 * Calculate prices for all units (base + alternates)
 *
 * @example
 * calculateAllUnitPrices(new Decimal(0.63), 'bottle', [
 *   { unit: 'box', conversionRate: 24 },
 *   { unit: 'case', conversionRate: 288 }
 * ])
 * // Returns array with prices for bottle, box, and case
 */
export function calculateAllUnitPrices(
  basePrice: Decimal,
  baseUnit: string,
  alternateUnits: AlternateUnit[],
  baseCost?: Decimal
): UnitPrice[] {
  const prices: UnitPrice[] = [
    {
      unit: baseUnit,
      price: basePrice,
      costPerUnit: baseCost,
    },
  ];

  for (const altUnit of alternateUnits) {
    const price = calculateAlternateUnitPrice(basePrice, altUnit.conversionRate);
    const costPerUnit = baseCost ? baseCost.times(altUnit.conversionRate) : undefined;

    prices.push({
      unit: altUnit.unit,
      price,
      costPerUnit,
    });
  }

  return prices;
}

/**
 * Validate alternate unit configuration
 * Ensures no duplicate units and valid conversion rates
 */
export function validateAlternateUnits(
  baseUnit: string,
  alternateUnits: AlternateUnit[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check for duplicate unit names
  const unitNames = [baseUnit, ...alternateUnits.map((u) => u.unit.toLowerCase())];
  const uniqueNames = new Set(unitNames);

  if (uniqueNames.size !== unitNames.length) {
    errors.push('Duplicate unit names detected');
  }

  // Check each alternate unit has same name as base unit
  for (const altUnit of alternateUnits) {
    if (altUnit.unit.toLowerCase() === baseUnit.toLowerCase()) {
      errors.push(`Alternate unit "${altUnit.unit}" cannot have the same name as base unit`);
    }

    if (altUnit.conversionRate <= 0) {
      errors.push(`Conversion rate for "${altUnit.unit}" must be positive`);
    }

    if (!Number.isFinite(altUnit.conversionRate)) {
      errors.push(`Conversion rate for "${altUnit.unit}" must be a valid number`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Format Decimal value to currency string
 */
export function formatPrice(value: Decimal, currency: string = 'UGX'): string {
  return `${currency} ${value.toFixed(2)}`;
}

/**
 * Round price to 2 decimal places for display
 */
export function roundPrice(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/**
 * Calculate weighted average cost when mixing different purchase batches
 * Useful when buying same product at different prices
 */
export function calculateWeightedAverageCost(
  existingQuantity: number,
  existingCost: Decimal,
  newQuantity: number,
  newCost: Decimal
): Decimal {
  if (existingQuantity < 0 || newQuantity < 0) {
    throw new Error('Quantities cannot be negative');
  }

  const totalQuantity = existingQuantity + newQuantity;

  if (totalQuantity === 0) {
    return new Decimal(0);
  }

  const existingTotal = existingCost.times(existingQuantity);
  const newTotal = newCost.times(newQuantity);
  const combinedTotal = existingTotal.plus(newTotal);

  return combinedTotal.dividedBy(totalQuantity);
}
