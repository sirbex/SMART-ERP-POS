/**
 * COGS Calculator Service
 * 
 * Handles Cost of Goods Sold calculations using FIFO (First-In-First-Out) method.
 * Manages batch allocation, cost tracking, and inventory valuation.
 * 
 * Key Features:
 * - FIFO cost calculation for sales
 * - Multi-unit support (base and alternate units)
 * - Batch tracking and allocation
 * - Precise Decimal arithmetic
 * - Transaction safety
 */

import prisma from '../config/database.js';
import logger from '../utils/logger.js';
import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// TYPES
// ============================================================================

interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  quantityAllocated: Decimal; // in base unit
  unitCost: Decimal;
  totalCost: Decimal;
}

interface COGSResult {
  totalCost: Decimal;
  totalQuantity: Decimal; // in base unit
  batches: BatchAllocation[];
  averageCost: Decimal;
}

interface UnitConversion {
  baseQuantity: Decimal;
  conversionFactor: Decimal;
}

// ============================================================================
// UNIT CONVERSION HELPERS
// ============================================================================

/**
 * Convert quantity from specified unit to base unit
 */
async function convertToBaseUnit(
  productId: string,
  quantity: Decimal,
  unit: string
): Promise<Decimal> {
  // If already base unit, return as-is
  if (unit === 'base') {
    return quantity;
  }

  // Fetch product with alternate unit configuration
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      hasMultipleUnits: true,
      alternateUnit: true,
      conversionFactor: true
    }
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  if (!product.hasMultipleUnits || !product.alternateUnit || !product.conversionFactor) {
    throw new Error(`Product ${productId} does not have alternate unit configuration`);
  }

  if (unit !== product.alternateUnit) {
    throw new Error(`Invalid unit "${unit}" for product ${productId}. Expected "${product.alternateUnit}" or "base"`);
  }

  // Convert: quantity * conversionFactor = base quantity
  // Example: 2 boxes * 12 pieces/box = 24 pieces
  const baseQuantity = quantity.mul(product.conversionFactor);
  
  logger.debug('Unit conversion', {
    productId,
    quantity: quantity.toString(),
    unit,
    conversionFactor: product.conversionFactor.toString(),
    baseQuantity: baseQuantity.toString()
  });

  return baseQuantity;
}

/**
 * Validate product exists and has sufficient stock
 */
async function validateProduct(
  productId: string,
  requiredQuantity: Decimal
): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, currentStock: true }
  });

  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  if (product.currentStock.lessThan(requiredQuantity)) {
    throw new Error(
      `Insufficient stock for ${product.name}. Available: ${product.currentStock}, Required: ${requiredQuantity}`
    );
  }
}

// ============================================================================
// FIFO BATCH ALLOCATION
// ============================================================================

/**
 * Allocate stock batches using FIFO (First-In-First-Out) method
 * 
 * Returns array of batch allocations in chronological order (oldest first)
 */
async function allocateFIFOBatches(
  productId: string,
  requiredQuantity: Decimal
): Promise<BatchAllocation[]> {
  // Fetch available batches ordered by receivedDate (FIFO)
  const batches = await prisma.stockBatch.findMany({
    where: {
      productId,
      quantityRemaining: { gt: 0 }
    },
    orderBy: { receivedDate: 'asc' }, // FIFO: oldest first
    select: {
      id: true,
      batchNumber: true,
      quantityRemaining: true,
      unitCost: true,
      receivedDate: true
    }
  });

  if (batches.length === 0) {
    throw new Error(`No stock batches available for product ${productId}`);
  }

  const allocations: BatchAllocation[] = [];
  let remainingQuantity = requiredQuantity;

  for (const batch of batches) {
    if (remainingQuantity.lessThanOrEqualTo(0)) {
      break; // All quantity allocated
    }

    // Determine how much to take from this batch
    const quantityFromBatch = Decimal.min(batch.quantityRemaining, remainingQuantity);
    const costFromBatch = quantityFromBatch.mul(batch.unitCost);

    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantityAllocated: quantityFromBatch,
      unitCost: batch.unitCost,
      totalCost: costFromBatch
    });

    remainingQuantity = remainingQuantity.sub(quantityFromBatch);

    logger.debug('Batch allocated', {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantityAllocated: quantityFromBatch.toString(),
      unitCost: batch.unitCost.toString(),
      costFromBatch: costFromBatch.toString(),
      remainingQuantity: remainingQuantity.toString()
    });
  }

  // Verify all quantity was allocated
  if (remainingQuantity.greaterThan(0)) {
    throw new Error(
      `Insufficient stock batches to fulfill quantity. Short by ${remainingQuantity.toString()} units`
    );
  }

  return allocations;
}

// ============================================================================
// MAIN COGS CALCULATION
// ============================================================================

/**
 * Calculate Cost of Goods Sold (COGS) for a sale item using FIFO
 * 
 * @param productId - Product ID
 * @param quantity - Quantity being sold
 * @param unit - Unit of measure ('base' or alternate unit name)
 * @returns COGSResult with total cost and batch allocations
 */
export async function calculateFIFOCost(
  productId: string,
  quantity: Decimal,
  unit: string = 'base'
): Promise<COGSResult> {
  try {
    // 1. Validate inputs
    if (quantity.lessThanOrEqualTo(0)) {
      throw new Error('Quantity must be greater than zero');
    }

    // 2. Convert to base unit if needed
    const baseQuantity = await convertToBaseUnit(productId, quantity, unit);

    // 3. Validate product and stock availability
    await validateProduct(productId, baseQuantity);

    // 4. Allocate batches using FIFO
    const allocations = await allocateFIFOBatches(productId, baseQuantity);

    // 5. Calculate totals
    const totalCost = allocations.reduce(
      (sum, alloc) => sum.add(alloc.totalCost),
      new Decimal(0)
    );

    const averageCost = totalCost.div(baseQuantity);

    logger.info('FIFO cost calculated', {
      productId,
      quantity: quantity.toString(),
      unit,
      baseQuantity: baseQuantity.toString(),
      totalCost: totalCost.toString(),
      averageCost: averageCost.toString(),
      batchCount: allocations.length
    });

    return {
      totalCost,
      totalQuantity: baseQuantity,
      batches: allocations,
      averageCost
    };
  } catch (error: any) {
    logger.error('FIFO cost calculation failed', {
      productId,
      quantity: quantity.toString(),
      unit,
      error: error.message
    });
    throw error;
  }
}

/**
 * Update batch quantities after sale confirmation
 * Must be called within a transaction after sale is created
 * 
 * @param allocations - Batch allocations from calculateFIFOCost
 */
export async function updateBatchQuantities(
  allocations: BatchAllocation[]
): Promise<void> {
  try {
    for (const allocation of allocations) {
      await prisma.stockBatch.update({
        where: { id: allocation.batchId },
        data: {
          quantityRemaining: {
            decrement: allocation.quantityAllocated
          }
        }
      });

      logger.debug('Batch quantity updated', {
        batchId: allocation.batchId,
        batchNumber: allocation.batchNumber,
        quantityReduced: allocation.quantityAllocated.toString()
      });
    }

    logger.info('Batch quantities updated', {
      batchCount: allocations.length
    });
  } catch (error: any) {
    logger.error('Failed to update batch quantities', {
      error: error.message,
      allocations: allocations.map(a => ({
        batchId: a.batchId,
        quantity: a.quantityAllocated.toString()
      }))
    });
    throw error;
  }
}

/**
 * Reverse batch quantity updates (for refunds/cancellations)
 * 
 * @param allocations - Original batch allocations to reverse
 */
export async function reverseBatchQuantities(
  allocations: BatchAllocation[]
): Promise<void> {
  try {
    for (const allocation of allocations) {
      await prisma.stockBatch.update({
        where: { id: allocation.batchId },
        data: {
          quantityRemaining: {
            increment: allocation.quantityAllocated
          }
        }
      });

      logger.debug('Batch quantity reversed', {
        batchId: allocation.batchId,
        batchNumber: allocation.batchNumber,
        quantityRestored: allocation.quantityAllocated.toString()
      });
    }

    logger.info('Batch quantities reversed', {
      batchCount: allocations.length
    });
  } catch (error: any) {
    logger.error('Failed to reverse batch quantities', {
      error: error.message
    });
    throw error;
  }
}

// ============================================================================
// SALE-LEVEL COGS OPERATIONS
// ============================================================================

/**
 * Calculate total COGS for an entire sale with multiple items
 * 
 * @param items - Array of sale items with productId, quantity, unit
 * @returns Total COGS and detailed item costs
 */
export async function calculateSaleCOGS(
  items: Array<{ productId: string; quantity: Decimal; unit: string }>
): Promise<{
  totalCOGS: Decimal;
  itemCosts: Array<{ productId: string; cost: Decimal; allocations: BatchAllocation[] }>;
}> {
  const itemCosts: Array<{ productId: string; cost: Decimal; allocations: BatchAllocation[] }> = [];
  let totalCOGS = new Decimal(0);

  for (const item of items) {
    const cogsResult = await calculateFIFOCost(item.productId, item.quantity, item.unit);
    
    itemCosts.push({
      productId: item.productId,
      cost: cogsResult.totalCost,
      allocations: cogsResult.batches
    });

    totalCOGS = totalCOGS.add(cogsResult.totalCost);
  }

  logger.info('Sale COGS calculated', {
    itemCount: items.length,
    totalCOGS: totalCOGS.toString()
  });

  return { totalCOGS, itemCosts };
}

/**
 * Recalculate COGS for an existing sale (e.g., after modification)
 * 
 * @param saleId - Sale ID to recalculate
 */
export async function recalculateSaleCOGS(saleId: string): Promise<void> {
  try {
    // Fetch sale items
    const saleItems = await prisma.saleItem.findMany({
      where: { saleId },
      select: {
        id: true,
        productId: true,
        quantity: true,
        unit: true
      }
    });

    if (saleItems.length === 0) {
      logger.warn('No items found for sale', { saleId });
      return;
    }

    // Recalculate COGS for each item
    let totalCost = new Decimal(0);
    
    for (const item of saleItems) {
      const cogsResult = await calculateFIFOCost(item.productId, item.quantity, item.unit);
      
      // Update sale item cost
      await prisma.saleItem.update({
        where: { id: item.id },
        data: {
          costTotal: cogsResult.totalCost,
          unitCost: cogsResult.averageCost,
          lineCost: cogsResult.totalCost
        }
      });

      totalCost = totalCost.add(cogsResult.totalCost);
    }

    // Update sale totals
    const sale = await prisma.sale.findUnique({
      where: { id: saleId },
      select: { totalAmount: true }
    });

    if (!sale) {
      throw new Error(`Sale ${saleId} not found`);
    }

    const profit = sale.totalAmount.sub(totalCost);
    const profitMargin = sale.totalAmount.greaterThan(0)
      ? profit.div(sale.totalAmount)
      : new Decimal(0);

    await prisma.sale.update({
      where: { id: saleId },
      data: {
        totalCost,
        profit,
        profitMargin
      }
    });

    logger.info('Sale COGS recalculated', {
      saleId,
      totalCost: totalCost.toString(),
      profit: profit.toString(),
      profitMargin: profitMargin.toString()
    });
  } catch (error: any) {
    logger.error('Failed to recalculate sale COGS', {
      saleId,
      error: error.message
    });
    throw error;
  }
}

/**
 * Get current inventory valuation using FIFO method
 * 
 * @param productId - Optional product ID (if omitted, calculates for all products)
 */
export async function getInventoryValuation(productId?: string): Promise<{
  totalValue: Decimal;
  products: Array<{ productId: string; quantity: Decimal; value: Decimal }>;
}> {
  const where = productId ? { productId } : {};

  const batches = await prisma.stockBatch.findMany({
    where: {
      ...where,
      quantityRemaining: { gt: 0 }
    },
    select: {
      productId: true,
      quantityRemaining: true,
      unitCost: true
    }
  });

  const productMap = new Map<string, { quantity: Decimal; value: Decimal }>();

  for (const batch of batches) {
    const existing = productMap.get(batch.productId) || {
      quantity: new Decimal(0),
      value: new Decimal(0)
    };

    const batchValue = batch.quantityRemaining.mul(batch.unitCost);

    productMap.set(batch.productId, {
      quantity: existing.quantity.add(batch.quantityRemaining),
      value: existing.value.add(batchValue)
    });
  }

  const products = Array.from(productMap.entries()).map(([id, data]) => ({
    productId: id,
    quantity: data.quantity,
    value: data.value
  }));

  const totalValue = products.reduce(
    (sum, p) => sum.add(p.value),
    new Decimal(0)
  );

  logger.info('Inventory valuation calculated', {
    productCount: products.length,
    totalValue: totalValue.toString()
  });

  return { totalValue, products };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  calculateFIFOCost,
  updateBatchQuantities,
  reverseBatchQuantities,
  calculateSaleCOGS,
  recalculateSaleCOGS,
  getInventoryValuation
};
