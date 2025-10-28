/**
 * FEFO (First Expired First Out) Logic Utility
 * 
 * Intelligent batch selection algorithm that prioritizes:
 * 1. Batches expiring soonest (FEFO principle)
 * 2. Excludes expired batches
 * 3. Handles null expiry dates (placed last)
 * 4. Multi-batch allocation when needed
 * 
 * Used for:
 * - POS sales (automatic batch deduction)
 * - Expiry alerts (proactive management)
 * - Batch cleanup (expired batch identification)
 * - Cost calculations (COGS, weighted average)
 */

import { PrismaClient, InventoryBatch, Product } from '@prisma/client';
import { Decimal } from 'decimal.js';

const prisma = new PrismaClient();

/**
 * Batch with product details (for return types)
 */
export interface BatchWithProduct extends InventoryBatch {
  product: Product;
}

/**
 * Batch allocation result
 */
export interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  quantity: number;
  costPrice: number;
  expiryDate: Date | null;
}

/**
 * Get FEFO-ordered batches for a specific product
 * Returns active batches sorted by expiry date (earliest first)
 * Null expiry dates are placed last
 * 
 * @param productId - Product UUID
 * @returns Array of batches in FEFO order
 */
export async function getFEFOBatchesForProduct(
  productId: string
): Promise<InventoryBatch[]> {
  const now = new Date();

  const batches = await prisma.inventoryBatch.findMany({
    where: {
      productId,
      status: 'ACTIVE',
      remainingQuantity: {
        gt: 0
      },
      OR: [
        {
          expiryDate: {
            gte: now  // Not expired
          }
        },
        {
          expiryDate: null  // No expiry date
        }
      ]
    },
    orderBy: [
      {
        expiryDate: {
          sort: 'asc',
          nulls: 'last'  // Batches without expiry come last
        }
      },
      {
        receivedDate: 'asc'  // If same expiry, older received first
      }
    ],
    include: {
      product: true
    }
  });

  return batches;
}

/**
 * Allocate quantity from batches using FEFO logic
 * Intelligently distributes required quantity across multiple batches if needed
 * 
 * @param productId - Product UUID
 * @param requiredQuantity - Total quantity needed
 * @returns Array of batch allocations or null if insufficient stock
 */
export async function allocateFEFOBatches(
  productId: string,
  requiredQuantity: number
): Promise<BatchAllocation[] | null> {
  const batches = await getFEFOBatchesForProduct(productId);

  if (batches.length === 0) {
    return null;
  }

  // Check if total available is sufficient
  const totalAvailable = batches.reduce((sum, batch) => new Decimal(sum).plus(batch.remainingQuantity), new Decimal(0)).toNumber();

  if (totalAvailable < requiredQuantity) {
    return null;  // Insufficient stock
  }

  // Allocate from batches in FEFO order
  const allocations: BatchAllocation[] = [];
  let remaining = new Decimal(requiredQuantity);

  for (const batch of batches) {
    if (remaining.lte(0)) {
      break;  // All quantity allocated
    }

    const batchAvailable = new Decimal(batch.remainingQuantity);
    const toAllocate = Decimal.min(remaining, batchAvailable);

    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      quantity: toAllocate.toNumber(),
      costPrice: new Decimal(batch.costPrice).toNumber(),
      expiryDate: batch.expiryDate
    });

    remaining = remaining.minus(toAllocate);
  }

  return allocations;
}

/**
 * Get batches expiring within specified days
 * Used for expiry alert system
 * 
 * @param days - Number of days to look ahead (default: 30)
 * @returns Array of batches expiring soon
 */
export async function getExpiringBatches(
  days: number = 30
): Promise<BatchWithProduct[]> {
  const now = new Date();
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  const batches = await prisma.inventoryBatch.findMany({
    where: {
      status: 'ACTIVE',
      remainingQuantity: {
        gt: 0
      },
      expiryDate: {
        gte: now,
        lte: futureDate
      }
    },
    orderBy: {
      expiryDate: 'asc'
    },
    include: {
      product: true
    }
  });

  return batches;
}

/**
 * Get expired batches (past expiry date, still active)
 * Used for cleanup and write-off processes
 * 
 * @returns Array of expired batches
 */
export async function getExpiredBatches(): Promise<BatchWithProduct[]> {
  const now = new Date();

  const batches = await prisma.inventoryBatch.findMany({
    where: {
      status: 'ACTIVE',
      expiryDate: {
        lt: now
      }
    },
    orderBy: {
      expiryDate: 'asc'
    },
    include: {
      product: true
    }
  });

  return batches;
}

/**
 * Calculate Cost of Goods Sold (COGS) from batch allocations
 * Uses actual cost from batches (FEFO-based)
 * 
 * @param allocations - Batch allocations from allocateFEFOBatches
 * @returns Total COGS
 */
export function calculateCOGS(allocations: BatchAllocation[]): Decimal {
  let totalCOGS = new Decimal(0);

  for (const allocation of allocations) {
    const qty = new Decimal(allocation.quantity);
    const cost = new Decimal(allocation.costPrice);
    const itemCOGS = qty.times(cost);
    totalCOGS = totalCOGS.plus(itemCOGS);
  }

  return totalCOGS;
}

/**
 * Calculate weighted average cost from batch allocations
 * 
 * @param allocations - Batch allocations
 * @returns Weighted average cost per unit
 */
export function calculateWeightedAvgCost(allocations: BatchAllocation[]): Decimal {
  const totalCOGS = calculateCOGS(allocations);
  
  const totalQuantity = allocations.reduce(
    (sum, allocation) => sum + allocation.quantity,
    0
  );

  if (totalQuantity === 0) {
    return new Decimal(0);
  }

  return totalCOGS.div(totalQuantity);
}

/**
 * Get batch summary for a product
 * Useful for dashboard/reporting
 * 
 * @param productId - Product UUID
 * @returns Batch summary statistics
 */
export async function getBatchSummary(productId: string) {
  const batches = await prisma.inventoryBatch.findMany({
    where: {
      productId,
      status: 'ACTIVE'
    }
  });

  const totalQuantity = batches.reduce((sum, b) => new Decimal(sum).plus(b.quantity), new Decimal(0)).toNumber();
  const totalRemaining = batches.reduce((sum, b) => new Decimal(sum).plus(b.remainingQuantity), new Decimal(0)).toNumber();
  
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  const expiringBatches = batches.filter(
    b => b.expiryDate && b.expiryDate >= now && b.expiryDate <= thirtyDaysFromNow
  );

  const expiredBatches = batches.filter(
    b => b.expiryDate && b.expiryDate < now
  );

  return {
    totalBatches: batches.length,
    totalQuantity,
    totalRemaining,
    expiringCount: expiringBatches.length,
    expiredCount: expiredBatches.length,
    utilizationRate: totalQuantity > 0 
      ? ((totalQuantity - totalRemaining) / totalQuantity * 100).toFixed(2)
      : '0.00'
  };
}
