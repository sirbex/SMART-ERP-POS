import prisma from '../config/database.js';
import { CostingMethod, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../utils/logger.js';
import { PricingService } from './pricingService.js';

export interface CostLayerAllocation {
  costLayerId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
}

export interface ActualCostResult {
  weightedAverageCost: number;
  totalCost: number;
  allocations: CostLayerAllocation[];
}

/**
 * Cost Layer Service - FIFO-only inventory valuation
 * 
 * This service tracks cost layers for each product receipt and calculates
 * the actual cost of goods sold using the selected costing method.
 */
export class CostLayerService {
  
  /**
   * Create a new cost layer when goods are received
   */
  static async createCostLayer(data: {
    productId: string;
    quantity: number;
    unitCost: number;
    receivedDate: Date;
    goodsReceiptId?: string;
    batchNumber?: string;
  }): Promise<void> {
    try {
      // Use transaction to ensure data consistency
  await prisma.$transaction(async (tx: any) => {
        // Validate quantity and cost
        if (data.quantity <= 0) {
          throw new Error('Quantity must be greater than 0');
        }
        if (data.unitCost < 0) {
          throw new Error('Unit cost cannot be negative');
        }

        // Create cost layer
        await tx.costLayer.create({
          data: {
            productId: data.productId,
            quantity: new Decimal(data.quantity),
            remainingQuantity: new Decimal(data.quantity),
            unitCost: new Decimal(data.unitCost),
            receivedDate: data.receivedDate,
            goodsReceiptId: data.goodsReceiptId,
            batchNumber: data.batchNumber,
            isActive: true,
          },
        });

        // Update product's lastCost
        await tx.product.update({
          where: { id: data.productId },
          data: { lastCost: new Decimal(data.unitCost) },
        });

        // Recalculate average cost within transaction
        await this.updateAverageCostInTransaction(tx, data.productId);

      // Trigger price recalculation if auto-update is enabled
      // Run outside transaction to avoid long-running tx
      try {
        await PricingService.onCostChange(data.productId);
      } catch (error) {
        logger.error('Failed to trigger price recalculation after cost update', {
          productId: data.productId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Don't throw - cost layer was created successfully
      }
      });

      logger.info('Cost layer created', {
        productId: data.productId,
        quantity: data.quantity,
        unitCost: data.unitCost,
      });
    } catch (error) {
      logger.error('Failed to create cost layer', { error, data });
      throw error;
    }
  }

  /**
  * Calculate actual cost for a sale using FIFO method (FIFO-only)
   */
  static async calculateActualCost(
    productId: string,
    quantity: number,
    costingMethod: CostingMethod = CostingMethod.FIFO
  ): Promise<ActualCostResult> {
    // Validate inputs
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    // Check available stock
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { currentStock: true, costingMethod: true, costPrice: true },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const availableStock = new Decimal(product.currentStock);
    if (availableStock.lessThan(quantity)) {
      logger.warn('Insufficient stock for cost calculation', {
        productId,
        requestedQty: quantity,
        availableStock: availableStock.toNumber(),
      });
      // Allow calculation but warn - business may allow backorders
    }

    // FIFO-only: ignore requested/product costing method and always use FIFO
    return this.calculateFIFOCost(productId, quantity);
  }

  /**
   * FIFO (First In, First Out) cost calculation
   * Uses Decimal for precision to avoid floating-point errors
   */
  private static async calculateFIFOCost(
    productId: string,
    quantity: number
  ): Promise<ActualCostResult> {
    // Get cost layers ordered by receivedDate (oldest first)
    const costLayers = await prisma.costLayer.findMany({
      where: {
        productId,
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { receivedDate: 'asc' },
    });

    if (costLayers.length === 0) {
      logger.warn('No cost layers found for FIFO calculation', { productId });
      return {
        weightedAverageCost: 0,
        totalCost: 0,
        allocations: [],
      };
    }

    const allocations: CostLayerAllocation[] = [];
    let remainingQty = new Decimal(quantity);
    let totalCost = new Decimal(0);

    for (const layer of costLayers) {
      if (remainingQty.lessThanOrEqualTo(0)) break;

      const layerQty = new Decimal(layer.remainingQuantity);
      const qtyFromLayer = Decimal.min(layerQty, remainingQty);
      const unitCost = new Decimal(layer.unitCost);
      const costFromLayer = qtyFromLayer.times(unitCost);

      allocations.push({
        costLayerId: layer.id,
        quantity: qtyFromLayer.toNumber(),
        unitCost: unitCost.toNumber(),
        totalCost: costFromLayer.toNumber(),
      });

      totalCost = totalCost.plus(costFromLayer);
      remainingQty = remainingQty.minus(qtyFromLayer);
    }

    if (remainingQty.greaterThan(0)) {
      logger.warn('Insufficient cost layers for FIFO calculation', {
        productId,
        requestedQty: quantity,
        shortfall: remainingQty.toNumber(),
      });
    }

    const totalQty = new Decimal(quantity);
    const weightedAvg = totalQty.greaterThan(0) 
      ? totalCost.dividedBy(totalQty) 
      : new Decimal(0);

    return {
      weightedAverageCost: weightedAvg.toNumber(),
      totalCost: totalCost.toNumber(),
      allocations,
    };
  }

  /**
   * AVCO (Average Cost) calculation
   * Uses current average cost from product
   */
  private static async calculateAVCOCost(
    productId: string,
    quantity: number
  ): Promise<ActualCostResult> {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { averageCost: true },
    });

    if (!product) {
      throw new Error('Product not found');
    }

    const averageCost = new Decimal(product.averageCost || 0);
    const totalCost = averageCost.times(quantity);

    return {
      weightedAverageCost: averageCost.toNumber(),
      totalCost: totalCost.toNumber(),
      allocations: [], // AVCO doesn't allocate to specific layers
    };
  }

  /**
  * Deduct quantity from cost layers after a sale
  * CRITICAL: Must be called within a transaction from sales module
   */
  static async deductFromCostLayers(
    productId: string,
    quantity: number,
    costingMethod: CostingMethod = CostingMethod.FIFO
  ): Promise<void> {
    if (quantity <= 0) {
      throw new Error('Quantity must be greater than 0');
    }

    try {
  await prisma.$transaction(async (tx: any) => {
        // FIFO-only: always deduct using FIFO
        await this.deductFIFOLayers(tx, productId, quantity);
        // Recalculate average cost after deduction
        await this.updateAverageCostInTransaction(tx, productId);
      });

      logger.info('Cost layers deducted', { productId, quantity, method: CostingMethod.FIFO });
    } catch (error) {
      logger.error('Failed to deduct from cost layers', { error, productId, quantity });
      throw error;
    }
  }

  /**
   * Deduct using FIFO method (oldest layers first)
   */
  private static async deductFIFOLayers(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number
  ): Promise<void> {
    const costLayers = await tx.costLayer.findMany({
      where: {
        productId,
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
      orderBy: { receivedDate: 'asc' },
    });

    let remainingQty = new Decimal(quantity);

    for (const layer of costLayers) {
      if (remainingQty.lessThanOrEqualTo(0)) break;

      const layerQty = new Decimal(layer.remainingQuantity);
      const qtyToDeduct = Decimal.min(layerQty, remainingQty);
      const newRemaining = layerQty.minus(qtyToDeduct);

      await tx.costLayer.update({
        where: { id: layer.id },
        data: {
          remainingQuantity: newRemaining,
          isActive: newRemaining.greaterThan(0), // Deactivate if depleted
        },
      });

      remainingQty = remainingQty.minus(qtyToDeduct);
    }

    if (remainingQty.greaterThan(0.0001)) {
      logger.warn('Insufficient cost layers for FIFO deduction', {
        productId,
        requestedQty: quantity,
        shortfall: remainingQty.toNumber(),
      });
    }
  }

  /**
   * Deduct using AVCO method (proportional reduction from all layers)
   */
  private static async deductAVCOLayers(
    tx: Prisma.TransactionClient,
    productId: string,
    quantity: number
  ): Promise<void> {
    const costLayers = await tx.costLayer.findMany({
      where: {
        productId,
        isActive: true,
        remainingQuantity: { gt: 0 },
      },
    });

    if (costLayers.length === 0) {
      logger.warn('No cost layers found for AVCO deduction', { productId });
      return;
    }

    // Calculate total quantity across all layers
    let totalQty = new Decimal(0);
    for (const layer of costLayers) {
      totalQty = totalQty.plus(layer.remainingQuantity);
    }

    if (totalQty.lessThan(quantity)) {
      logger.warn('Insufficient inventory for AVCO deduction', {
        productId,
        requestedQty: quantity,
        availableQty: totalQty.toNumber(),
      });
    }

    // Proportionally reduce each layer
    const deductionRatio = new Decimal(quantity).dividedBy(totalQty);

    for (const layer of costLayers) {
      const layerQty = new Decimal(layer.remainingQuantity);
      const qtyToDeduct = layerQty.times(deductionRatio);
      const newRemaining = layerQty.minus(qtyToDeduct);

      await tx.costLayer.update({
        where: { id: layer.id },
        data: {
          remainingQuantity: newRemaining,
          isActive: newRemaining.greaterThan(0.0001), // Deactivate if near zero
        },
      });
    }
  }

  /**
   * Update product's average cost based on all cost layers
   */
  static async updateAverageCost(productId: string): Promise<void> {
    try {
      const layers = await prisma.costLayer.findMany({
        where: {
          productId,
          isActive: true,
          remainingQuantity: { gt: 0 },
        },
      });

      if (layers.length === 0) {
        // No layers, keep current average cost
        return;
      }

      let totalCost = new Decimal(0);
      let totalQty = new Decimal(0);

      for (const layer of layers) {
        const qty = new Decimal(layer.remainingQuantity);
        const cost = new Decimal(layer.unitCost);
        totalCost = totalCost.plus(qty.times(cost));
        totalQty = totalQty.plus(qty);
      }

      const averageCost = totalQty.greaterThan(0) 
        ? totalCost.dividedBy(totalQty) 
        : new Decimal(0);

      // Update both averageCost and costPrice to keep them in sync
      await prisma.product.update({
        where: { id: productId },
        data: { 
          averageCost,
          costPrice: averageCost, // Update costPrice to match average cost
        },
      });

      logger.debug('Average cost updated', { productId, averageCost: averageCost.toNumber() });
    } catch (error) {
      logger.error('Failed to update average cost', { error, productId });
      throw error;
    }
  }

  /**
   * Update average cost within a transaction (for transactional consistency)
   */
  private static async updateAverageCostInTransaction(
    tx: Prisma.TransactionClient,
    productId: string
  ): Promise<void> {
    try {
      const layers = await tx.costLayer.findMany({
        where: {
          productId,
          isActive: true,
          remainingQuantity: { gt: 0 },
        },
      });

      if (layers.length === 0) {
        return;
      }

      let totalCost = new Decimal(0);
      let totalQty = new Decimal(0);

      for (const layer of layers) {
        const qty = new Decimal(layer.remainingQuantity);
        const cost = new Decimal(layer.unitCost);
        totalCost = totalCost.plus(qty.times(cost));
        totalQty = totalQty.plus(qty);
      }

      const averageCost = totalQty.greaterThan(0) 
        ? totalCost.dividedBy(totalQty) 
        : new Decimal(0);

      // Update both averageCost and costPrice to keep them in sync
      await tx.product.update({
        where: { id: productId },
        data: { 
          averageCost,
          costPrice: averageCost, // Update costPrice to match average cost
        },
      });

      logger.debug('Average cost updated in transaction', { 
        productId, 
        averageCost: averageCost.toNumber() 
      });
    } catch (error) {
      logger.error('Failed to update average cost in transaction', { error, productId });
      throw error;
    }
  }

  /**
   * Get cost layer summary for a product
   */
  static async getCostLayerSummary(productId: string) {
    const layers = await prisma.costLayer.findMany({
      where: { productId, isActive: true },
      orderBy: { receivedDate: 'asc' },
    });

    let totalQuantity = new Decimal(0);
    let totalValue = new Decimal(0);

  const layerDetails = layers.map((layer: any) => {
      const qty = new Decimal(layer.remainingQuantity);
      const cost = new Decimal(layer.unitCost);
      const value = qty.times(cost);
      
      totalQuantity = totalQuantity.plus(qty);
      totalValue = totalValue.plus(value);

      return {
        id: layer.id,
        quantity: qty.toNumber(),
        unitCost: cost.toNumber(),
        value: value.toNumber(),
        receivedDate: layer.receivedDate,
        batchNumber: layer.batchNumber,
      };
    });

    const averageCost = totalQuantity.greaterThan(0)
      ? totalValue.dividedBy(totalQuantity)
      : new Decimal(0);

    return {
      layers: layerDetails,
      totalQuantity: totalQuantity.toNumber(),
      totalValue: totalValue.toNumber(),
      averageCost: averageCost.toNumber(),
    };
  }

  /**
   * Return quantity to cost layers (for sale returns/cancellations)
   */
  static async returnToCostLayers(
    productId: string,
    quantity: number,
    unitCost: number
  ): Promise<void> {
    try {
      if (quantity <= 0) {
        throw new Error('Return quantity must be greater than 0');
      }
      if (unitCost < 0) {
        throw new Error('Unit cost cannot be negative');
      }

      // Create a new cost layer for the return
      await this.createCostLayer({
        productId,
        quantity,
        unitCost,
        receivedDate: new Date(),
        batchNumber: `RETURN-${Date.now()}`,
      });

      logger.info('Quantity returned to cost layers', {
        productId,
        quantity,
        unitCost,
      });
    } catch (error) {
      logger.error('Failed to return to cost layers', { error, productId, quantity });
      throw error;
    }
  }
}
