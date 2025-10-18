/**
 * Purchase Cost Calculation Utilities
 * 
 * This module provides functions for calculating costs when purchasing in bulk
 * and determining selling prices for individual units and bulk units.
 */

import type { PurchaseUoM, SalesPricing } from '../models/InventoryItem';
import type { ProductUoM } from '../models/UnitOfMeasure';

/**
 * Calculate cost per base unit from bulk purchase information
 * @param costPerPurchaseUnit - Total cost for one purchase unit (e.g., $12 per box)
 * @param quantityPerPurchaseUnit - How many base units in one purchase unit (e.g., 24 bottles per box)
 * @returns Cost per base unit (e.g., $0.50 per bottle)
 */
export function calculateCostPerBaseUnit(
  costPerPurchaseUnit: number,
  quantityPerPurchaseUnit: number
): number {
  if (quantityPerPurchaseUnit <= 0) {
    throw new Error('Quantity per purchase unit must be greater than 0');
  }
  return costPerPurchaseUnit / quantityPerPurchaseUnit;
}

/**
 * Calculate selling price with markup
 * @param costPerUnit - Cost per unit
 * @param markupPercentage - Markup percentage (e.g., 25 for 25%)
 * @returns Selling price with markup applied
 */
export function calculateSellingPrice(
  costPerUnit: number,
  markupPercentage: number
): number {
  return costPerUnit * (1 + markupPercentage / 100);
}

/**
 * Create PurchaseUoM object with calculated costs
 * @param purchaseUnitId - ID of the purchase unit
 * @param purchaseUnitName - Display name of the purchase unit
 * @param quantityPerPurchaseUnit - Quantity of base units in one purchase unit
 * @param costPerPurchaseUnit - Total cost for one purchase unit
 * @param supplierInfo - Optional supplier information
 * @returns Complete PurchaseUoM object with calculated costs
 */
export function createPurchaseUoM(
  purchaseUnitId: string,
  purchaseUnitName: string,
  quantityPerPurchaseUnit: number,
  costPerPurchaseUnit: number,
  supplierInfo?: string
): PurchaseUoM {
  const costPerBaseUnit = calculateCostPerBaseUnit(costPerPurchaseUnit, quantityPerPurchaseUnit);
  
  return {
    purchaseUnitId,
    purchaseUnitName,
    quantityPerPurchaseUnit,
    costPerPurchaseUnit,
    costPerBaseUnit,
    supplierInfo
  };
}

/**
 * Generate UoM options with calculated pricing for both individual and bulk sales
 * @param purchaseInfo - Purchase information
 * @param salesPricing - Sales pricing strategy
 * @param baseUnitId - ID of the base unit (e.g., 'bottle')
 * @returns Array of ProductUoM options for sales
 */
export function generateSalesUoMOptions(
  purchaseInfo: PurchaseUoM,
  salesPricing: SalesPricing,
  baseUnitId: string
): ProductUoM[] {
  const baseUnitPrice = calculateSellingPrice(
    purchaseInfo.costPerBaseUnit, 
    salesPricing.markupPercentage
  );
  
  const bulkUnitPrice = calculateSellingPrice(
    purchaseInfo.costPerPurchaseUnit, 
    salesPricing.markupPercentage
  );
  
  // Ensure minimum selling price if specified
  const finalBaseUnitPrice = salesPricing.minimumSellingPrice 
    ? Math.max(baseUnitPrice, salesPricing.minimumSellingPrice)
    : baseUnitPrice;
    
  const finalBulkUnitPrice = salesPricing.minimumSellingPrice 
    ? Math.max(bulkUnitPrice, salesPricing.minimumSellingPrice * purchaseInfo.quantityPerPurchaseUnit)
    : bulkUnitPrice;

  return [
    {
      uomId: baseUnitId,
      price: finalBaseUnitPrice,
      isDefault: true,
      conversionFactor: 1,
      barcode: undefined
    },
    {
      uomId: purchaseInfo.purchaseUnitId,
      price: finalBulkUnitPrice,
      isDefault: false,
      conversionFactor: purchaseInfo.quantityPerPurchaseUnit,
      barcode: undefined
    }
  ];
}

/**
 * Update existing inventory item with new purchase information
 * @param existingQuantity - Current inventory quantity (in base units)
 * @param newPurchaseQuantity - Number of purchase units being added
 * @param purchaseInfo - Purchase information for the new stock
 * @returns New total quantity in base units
 */
export function calculateNewInventoryQuantity(
  existingQuantity: number,
  newPurchaseQuantity: number,
  purchaseInfo: PurchaseUoM
): number {
  const newBaseUnits = newPurchaseQuantity * purchaseInfo.quantityPerPurchaseUnit;
  return existingQuantity + newBaseUnits;
}

/**
 * Calculate weighted average cost when mixing old and new inventory
 * @param oldQuantity - Existing inventory quantity (in base units)
 * @param oldCostPerUnit - Existing cost per base unit
 * @param newQuantity - New inventory quantity (in base units)
 * @param newCostPerUnit - New cost per base unit
 * @returns Weighted average cost per base unit
 */
export function calculateWeightedAverageCost(
  oldQuantity: number,
  oldCostPerUnit: number,
  newQuantity: number,
  newCostPerUnit: number
): number {
  const totalQuantity = oldQuantity + newQuantity;
  if (totalQuantity === 0) return 0;
  
  const totalValue = (oldQuantity * oldCostPerUnit) + (newQuantity * newCostPerUnit);
  return totalValue / totalQuantity;
}

/**
 * Validate purchase data for consistency
 * @param purchaseInfo - Purchase information to validate
 * @throws Error if validation fails
 */
export function validatePurchaseInfo(purchaseInfo: PurchaseUoM): void {
  if (purchaseInfo.quantityPerPurchaseUnit <= 0) {
    throw new Error('Quantity per purchase unit must be greater than 0');
  }
  
  if (purchaseInfo.costPerPurchaseUnit < 0) {
    throw new Error('Cost per purchase unit cannot be negative');
  }
  
  if (purchaseInfo.costPerBaseUnit < 0) {
    throw new Error('Cost per base unit cannot be negative');
  }
  
  // Verify the calculation is correct
  const calculatedCostPerBase = purchaseInfo.costPerPurchaseUnit / purchaseInfo.quantityPerPurchaseUnit;
  const tolerance = 0.001; // Allow for floating point precision
  
  if (Math.abs(purchaseInfo.costPerBaseUnit - calculatedCostPerBase) > tolerance) {
    throw new Error('Cost per base unit calculation is inconsistent');
  }
}

/**
 * Format cost information for display
 * @param purchaseInfo - Purchase information
 * @returns Formatted string showing cost breakdown
 */
export function formatCostBreakdown(purchaseInfo: PurchaseUoM): string {
  return `${purchaseInfo.purchaseUnitName}: $${purchaseInfo.costPerPurchaseUnit.toFixed(2)} ` +
         `(${purchaseInfo.quantityPerPurchaseUnit} units @ $${purchaseInfo.costPerBaseUnit.toFixed(2)} each)`;
}

/**
 * Example scenarios for common bulk purchase cases
 */
export const PurchaseScenarios = {
  /**
   * Beverage bottles in boxes scenario
   */
  bottlesInBox: {
    baseUnit: { id: 'bottle', name: 'Bottle' },
    purchaseUnit: { id: 'box', name: 'Box', quantity: 24 },
    exampleCost: 12.00, // $12 per box
    suggestedMarkup: 25 // 25% markup
  },
  
  /**
   * Medicine tablets in strips/boxes scenario  
   */
  tabletsInStrip: {
    baseUnit: { id: 'tablet', name: 'Tablet' },
    purchaseUnit: { id: 'strip', name: 'Strip', quantity: 10 },
    exampleCost: 5.00, // $5 per strip
    suggestedMarkup: 30 // 30% markup
  },
  
  /**
   * Items sold in dozens
   */
  itemsInDozen: {
    baseUnit: { id: 'piece', name: 'Piece' },
    purchaseUnit: { id: 'dozen', name: 'Dozen', quantity: 12 },
    exampleCost: 8.00, // $8 per dozen
    suggestedMarkup: 20 // 20% markup
  }
};