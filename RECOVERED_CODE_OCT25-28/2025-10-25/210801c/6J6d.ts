/**
 * FIFO Allocation Service
 * 
 * Implements First-In-First-Out inventory allocation for sales.
 * - Consumes batches in receivedDate order (oldest first)
 * - Reduces remainingQuantity per batch
 * - Records COGS (Cost of Goods Sold) in valuation layers
 * - Creates sale line items with batch references
 * - Marks batches as DEPLETED when empty
 */

import { PrismaClient, Prisma, MovementType, DocumentType } from '@prisma/client';
import { Decimal } from 'decimal.js';
import logger from '../utils/logger.js';
import { ValuationService } from './valuationService.js';

const prisma = new PrismaClient();

export interface FIFOAllocationInput {
  productId: string;
  quantity: number;
  saleId?: string;
  saleDate?: Date;
  performedById: string;
}

export interface BatchAllocation {
  batchId: string;
  batchNumber: string;
  quantityAllocated: number;
  unitCost: number;
  unitPrice: number;
  totalCost: number;
  totalPrice: number;
}

export interface FIFOAllocationResult {
  productId: string;
  requestedQuantity: number;
  allocatedQuantity: number;
  totalCOGS: number;
  totalRevenue: number;
  allocations: BatchAllocation[];
  insufficientStock: boolean;
}

export class FIFOAllocationService {
  /**
   * Allocate sale quantity from available batches using FIFO
   * Returns detailed allocation breakdown with COGS
   */
  static async allocateSale(
    input: FIFOAllocationInput,
    trx?: Prisma.TransactionClient
  ): Promise<FIFOAllocationResult> {
    const client = (trx || prisma) as PrismaClient;

    try {
      // Validate inputs
      if (input.quantity <= 0) {
        throw new Error('Allocation quantity must be positive');
      }

      const requestedQty = new Decimal(input.quantity);
      let remainingToAllocate = requestedQty;

      // Get available batches in FIFO order (oldest first)
      const availableBatches = await client.inventoryBatch.findMany({
        where: {
          productId: input.productId,
          status: 'ACTIVE',
          remainingQuantity: { gt: 0 },
        },
        orderBy: { receivedDate: 'asc' }, // FIFO: oldest first
      });

      if (availableBatches.length === 0) {
        logger.warn('No available batches for allocation', {
          productId: input.productId,
          requestedQty: input.quantity,
        });

        return {
          productId: input.productId,
          requestedQuantity: input.quantity,
          allocatedQuantity: 0,
          totalCOGS: 0,
          totalRevenue: 0,
          allocations: [],
          insufficientStock: true,
        };
      }

      const allocations: BatchAllocation[] = [];
      let totalCOGS = new Decimal(0);
      let totalRevenue = new Decimal(0);

      // Allocate from batches in FIFO order
      for (const batch of availableBatches) {
        if (remainingToAllocate.lte(0)) break;

        const batchRemaining = new Decimal(batch.remainingQuantity);
        const toAllocate = Decimal.min(remainingToAllocate, batchRemaining);

        if (toAllocate.lte(0)) continue;

        // Calculate costs and prices
        const unitCost = new Decimal(batch.costPrice);
        const unitPrice = (batch as any).sellingPrice
          ? new Decimal((batch as any).sellingPrice)
          : new Decimal(0);

        const allocationCost = unitCost.mul(toAllocate);
        const allocationRevenue = unitPrice.mul(toAllocate);

        totalCOGS = totalCOGS.plus(allocationCost);
        totalRevenue = totalRevenue.plus(allocationRevenue);

        // Update batch remaining quantity
        const newRemaining = batchRemaining.minus(toAllocate);
        const newStatus = newRemaining.eq(0) ? 'DEPLETED' : batch.status;

        await client.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            remainingQuantity: newRemaining.toNumber(),
            status: newStatus as any,
          },
        });

        // Record valuation layer for COGS (OUT movement)
        await ValuationService.record(client, {
          productId: input.productId,
          movementType: MovementType.OUT,
          quantity: toAllocate.toNumber(),
          unitCost: unitCost.toNumber(),
          totalCost: allocationCost.toNumber(),
          batchId: batch.id,
          sourceDocType: input.saleId ? DocumentType.SALE_INVOICE : null,
          sourceDocId: input.saleId || null,
          performedById: input.performedById,
        });

        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantityAllocated: toAllocate.toNumber(),
          unitCost: unitCost.toNumber(),
          unitPrice: unitPrice.toNumber(),
          totalCost: allocationCost.toNumber(),
          totalPrice: allocationRevenue.toNumber(),
        });

        remainingToAllocate = remainingToAllocate.minus(toAllocate);

        logger.debug('Batch allocated', {
          batchId: batch.id,
          allocated: toAllocate.toNumber(),
          remaining: newRemaining.toNumber(),
        });
      }

      const result: FIFOAllocationResult = {
        productId: input.productId,
        requestedQuantity: input.quantity,
        allocatedQuantity: requestedQty.minus(remainingToAllocate).toNumber(),
        totalCOGS: totalCOGS.toNumber(),
        totalRevenue: totalRevenue.toNumber(),
        allocations,
        insufficientStock: remainingToAllocate.gt(0),
      };

      if (result.insufficientStock) {
        logger.warn('Insufficient stock for full allocation', {
          productId: input.productId,
          requested: input.quantity,
          allocated: result.allocatedQuantity,
          shortfall: remainingToAllocate.toNumber(),
        });
      } else {
        logger.info('Sale allocated successfully via FIFO', {
          productId: input.productId,
          quantity: result.allocatedQuantity,
          cogs: result.totalCOGS,
          batchesUsed: allocations.length,
        });
      }

      return result;
    } catch (error) {
      logger.error('FIFO allocation failed', { error, input });
      throw error;
    }
  }

  /**
   * Preview allocation without committing
   * Useful for showing customer what batches will be used
   */
  static async previewAllocation(
    productId: string,
    quantity: number
  ): Promise<FIFOAllocationResult> {
    try {
      if (quantity <= 0) {
        throw new Error('Preview quantity must be positive');
      }

      const requestedQty = new Decimal(quantity);
      let remainingToAllocate = requestedQty;

      const availableBatches = await prisma.inventoryBatch.findMany({
        where: {
          productId,
          status: 'ACTIVE',
          remainingQuantity: { gt: 0 },
        },
        orderBy: { receivedDate: 'asc' },
      });

      if (availableBatches.length === 0) {
        return {
          productId,
          requestedQuantity: quantity,
          allocatedQuantity: 0,
          totalCOGS: 0,
          totalRevenue: 0,
          allocations: [],
          insufficientStock: true,
        };
      }

      const allocations: BatchAllocation[] = [];
      let totalCOGS = new Decimal(0);
      let totalRevenue = new Decimal(0);

      for (const batch of availableBatches) {
        if (remainingToAllocate.lte(0)) break;

        const batchRemaining = new Decimal(batch.remainingQuantity);
        const toAllocate = Decimal.min(remainingToAllocate, batchRemaining);

        if (toAllocate.lte(0)) continue;

        const unitCost = new Decimal(batch.costPrice);
        const unitPrice = (batch as any).sellingPrice
          ? new Decimal((batch as any).sellingPrice)
          : new Decimal(0);

        const allocationCost = unitCost.mul(toAllocate);
        const allocationRevenue = unitPrice.mul(toAllocate);

        totalCOGS = totalCOGS.plus(allocationCost);
        totalRevenue = totalRevenue.plus(allocationRevenue);

        allocations.push({
          batchId: batch.id,
          batchNumber: batch.batchNumber,
          quantityAllocated: toAllocate.toNumber(),
          unitCost: unitCost.toNumber(),
          unitPrice: unitPrice.toNumber(),
          totalCost: allocationCost.toNumber(),
          totalPrice: allocationRevenue.toNumber(),
        });

        remainingToAllocate = remainingToAllocate.minus(toAllocate);
      }

      return {
        productId,
        requestedQuantity: quantity,
        allocatedQuantity: requestedQty.minus(remainingToAllocate).toNumber(),
        totalCOGS: totalCOGS.toNumber(),
        totalRevenue: totalRevenue.toNumber(),
        allocations,
        insufficientStock: remainingToAllocate.gt(0),
      };
    } catch (error) {
      logger.error('Allocation preview failed', { error, productId, quantity });
      throw error;
    }
  }

  /**
   * Get current FIFO cost for a product (next batch to be consumed)
   * Useful for pricing decisions
   */
  static async getCurrentFIFOCost(productId: string): Promise<number | null> {
    try {
      const nextBatch = await prisma.inventoryBatch.findFirst({
        where: {
          productId,
          status: 'ACTIVE',
          remainingQuantity: { gt: 0 },
        },
        orderBy: { receivedDate: 'asc' },
        select: { costPrice: true },
      });

      if (!nextBatch) {
        return null;
      }

      return new Decimal(nextBatch.costPrice).toNumber();
    } catch (error) {
      logger.error('Failed to get current FIFO cost', { error, productId });
      throw error;
    }
  }
}
