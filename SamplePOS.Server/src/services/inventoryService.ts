/**
 * Inventory Service
 * 
 * Centralized business logic for inventory management including:
 * - Stock receiving and adjustments
 * - FIFO batch allocation
 * - Product stock level synchronization
 * - Batch tracking and expiry management
 * 
 * @module services/inventoryService
 */

import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import logger from '../utils/logger.js';

export interface ReceiveInventoryInput {
  productId: string;
  quantity: number;
  unitCost: number;
  batchNumber?: string;
  expiryDate?: Date | string;
  receivedDate?: Date | string;
  purchaseId?: string;
  notes?: string;
  userId: number;
}

export interface AdjustInventoryInput {
  productId: string;
  quantity: number;
  adjustmentType: 'IN' | 'OUT' | 'ADJUSTMENT';
  reason: string;
  notes?: string;
  userId: number;
}

export interface DeductInventoryInput {
  productId: string;
  quantity: number;
  referenceType: 'SALE' | 'ADJUSTMENT' | 'DAMAGE' | 'RETURN';
  referenceId?: string;
  userId: number;
}

/**
 * Receive inventory into stock
 * Creates a new stock batch and updates product current stock
 */
export async function receiveInventory(input: ReceiveInventoryInput) {
  const {
    productId,
    quantity,
    unitCost,
    batchNumber,
    expiryDate,
    receivedDate,
    purchaseId,
    notes,
    userId,
  } = input;

  // Validate product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const quantityDecimal = new Prisma.Decimal(quantity);
  const costDecimal = new Prisma.Decimal(unitCost);

  if (quantityDecimal.lte(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  if (costDecimal.lt(0)) {
    throw new Error('Unit cost cannot be negative');
  }

  // Generate batch number if not provided
  const finalBatchNumber = batchNumber?.trim() || `BATCH-${Date.now()}`;

  // Check for duplicate batch number
  const existingBatch = await prisma.stockBatch.findFirst({
    where: {
      productId,
      batchNumber: finalBatchNumber,
    },
  });

  if (existingBatch) {
    throw new Error(`Batch number ${finalBatchNumber} already exists for this product`);
  }

  // Perform inventory receipt in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create stock batch
    const batchData: Prisma.StockBatchCreateInput = {
      product: { connect: { id: productId } },
      quantityReceived: quantityDecimal,
      quantityRemaining: quantityDecimal,
      unitCost: costDecimal,
      receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
      batchNumber: finalBatchNumber,
      expiryDate: expiryDate ? new Date(expiryDate) : null,
    };

    // Note: purchaseId is for PurchaseOrder, but StockBatch.purchase relation is for old Purchase model
    // We'll leave purchaseId null since we're using PurchaseOrders now
    // TODO: Add purchaseOrderId field to StockBatch schema if needed

    const batch = await tx.stockBatch.create({
      data: batchData,
      include: {
        product: {
          select: {
            id: true,
            name: true,
            barcode: true,
          },
        },
      },
    });

    // Update product's current stock
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: {
        currentStock: {
          increment: quantityDecimal.toNumber(),
        },
      },
      select: {
        id: true,
        name: true,
        currentStock: true,
        reorderLevel: true,
      },
    });

    // Log inventory activity
    logger.info('Inventory received', {
      userId,
      productId,
      productName: product.name,
      quantity: quantity,
      batchNumber: finalBatchNumber,
      newStock: updatedProduct.currentStock,
      purchaseId,
    });

    return {
      batch,
      product: updatedProduct,
      quantityAdded: quantity,
    };
  });

  return result;
}

/**
 * Deduct inventory using FIFO method
 * Allocates from oldest batches first
 */
export async function deductInventory(input: DeductInventoryInput) {
  const { productId, quantity, referenceType, referenceId, userId } = input;

  // Validate product exists
  const product = await prisma.product.findUnique({
    where: { id: productId },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  const quantityDecimal = new Prisma.Decimal(quantity);

  if (quantityDecimal.lte(0)) {
    throw new Error('Quantity must be greater than zero');
  }

  // Get available batches (FIFO order)
  const availableBatches = await prisma.stockBatch.findMany({
    where: {
      productId,
      quantityRemaining: { gt: 0 },
    },
    orderBy: { receivedDate: 'asc' }, // FIFO
  });

  // Calculate total available stock
  const totalAvailable = availableBatches.reduce(
    (sum, batch) => sum.add(batch.quantityRemaining),
    new Prisma.Decimal(0)
  );

  if (totalAvailable.lt(quantityDecimal)) {
    throw new Error(
      `Insufficient stock. Available: ${totalAvailable}, Required: ${quantityDecimal}`
    );
  }

  // Perform deduction in transaction
  const result = await prisma.$transaction(async (tx) => {
    let remainingQty = quantityDecimal;
    const batchAllocations: Array<{
      batchId: string;
      batchNumber: string;
      quantityDeducted: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      totalCost: Prisma.Decimal;
    }> = [];

    // Deduct from batches using FIFO
    for (const batch of availableBatches) {
      if (remainingQty.lte(0)) break;

      const deductQty = remainingQty.lte(batch.quantityRemaining)
        ? remainingQty
        : batch.quantityRemaining;

      const newQuantity = batch.quantityRemaining.minus(deductQty);

      // Update batch quantity
      await tx.stockBatch.update({
        where: { id: batch.id },
        data: { quantityRemaining: newQuantity },
      });

      batchAllocations.push({
        batchId: batch.id,
        batchNumber: batch.batchNumber,
        quantityDeducted: deductQty,
        unitCost: batch.unitCost,
        totalCost: deductQty.mul(batch.unitCost),
      });

      remainingQty = remainingQty.minus(deductQty);
    }

    // Update product's current stock
    const updatedProduct = await tx.product.update({
      where: { id: productId },
      data: {
        currentStock: {
          decrement: quantityDecimal.toNumber(),
        },
      },
      select: {
        id: true,
        name: true,
        currentStock: true,
        reorderLevel: true,
      },
    });

    // Calculate total cost using FIFO
    const totalCost = batchAllocations.reduce(
      (sum, alloc) => sum.add(alloc.totalCost),
      new Prisma.Decimal(0)
    );

    const averageCost = totalCost.div(quantityDecimal);

    // Log inventory activity
    logger.info('Inventory deducted', {
      userId,
      productId,
      productName: product.name,
      quantity: quantity,
      referenceType,
      referenceId,
      newStock: updatedProduct.currentStock,
      batchesUsed: batchAllocations.length,
      totalCost: totalCost.toNumber(),
      averageCost: averageCost.toNumber(),
    });

    return {
      product: updatedProduct,
      quantityDeducted: quantity,
      batchAllocations,
      totalCost,
      averageCost,
    };
  });

  return result;
}

/**
 * Adjust inventory (manual adjustment)
 * Can increase or decrease stock with proper audit trail
 */
export async function adjustInventory(input: AdjustInventoryInput) {
  const { productId, quantity, adjustmentType, reason, notes, userId } = input;

  if (adjustmentType === 'IN') {
    // For incoming adjustments, use receiveInventory
    return receiveInventory({
      productId,
      quantity,
      unitCost: 0, // Manual adjustments may not have a cost
      batchNumber: `ADJ-IN-${Date.now()}`,
      notes: `Manual adjustment: ${reason}. ${notes || ''}`,
      userId,
    });
  } else if (adjustmentType === 'OUT') {
    // For outgoing adjustments, use deductInventory
    return deductInventory({
      productId,
      quantity,
      referenceType: 'ADJUSTMENT',
      userId,
    });
  } else {
    throw new Error('Invalid adjustment type. Use IN or OUT.');
  }
}

/**
 * Get current stock level for a product
 * Calculates from batches and verifies against product.currentStock
 */
export async function getProductStockLevel(productId: string) {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      name: true,
      barcode: true,
      currentStock: true,
      reorderLevel: true,
    },
  });

  if (!product) {
    throw new Error('Product not found');
  }

  // Calculate total from batches
  const batches = await prisma.stockBatch.findMany({
    where: {
      productId,
      quantityRemaining: { gt: 0 },
    },
    select: {
      id: true,
      batchNumber: true,
      quantityReceived: true,
      quantityRemaining: true,
      unitCost: true,
      receivedDate: true,
      expiryDate: true,
    },
    orderBy: { receivedDate: 'asc' },
  });

  const totalFromBatches = batches.reduce(
    (sum, batch) => sum + Number(batch.quantityRemaining),
    0
  );

  // Check for discrepancy
  const currentStockNum = Number(product.currentStock || 0);
  const discrepancy = totalFromBatches - currentStockNum;
  const hasDiscrepancy = Math.abs(discrepancy) > 0.01; // Allow small floating point differences

  if (hasDiscrepancy) {
    logger.warn('Stock level discrepancy detected', {
      productId,
      productName: product.name,
      productCurrentStock: product.currentStock,
      totalFromBatches,
      discrepancy,
    });
  }

  return {
    product,
    batches,
    totalFromBatches,
    currentStock: product.currentStock || 0,
    discrepancy,
    hasDiscrepancy,
    needsReorder: (product.currentStock || 0) <= (product.reorderLevel || 0),
  };
}

/**
 * Sync product stock from batches
 * Recalculates product.currentStock from actual batch quantities
 * Use this to fix discrepancies
 */
export async function syncProductStockFromBatches(productId: string) {
  const batches = await prisma.stockBatch.findMany({
    where: { productId },
    select: {
      quantityRemaining: true,
    },
  });

  const totalFromBatches = batches.reduce(
    (sum, batch) => sum + Number(batch.quantityRemaining),
    0
  );

  const updatedProduct = await prisma.product.update({
    where: { id: productId },
    data: {
      currentStock: totalFromBatches,
    },
    select: {
      id: true,
      name: true,
      currentStock: true,
    },
  });

  logger.info('Product stock synced from batches', {
    productId,
    productName: updatedProduct.name,
    newStock: updatedProduct.currentStock,
  });

  return updatedProduct;
}
