/**
 * Batch Pricing Service
 * 
 * Handles automatic price computation for inventory batches based on:
 * - Product pricing formulas and margins
 * - Batch-specific cost
 * - Customer group rules (via PricingService)
 * 
 * Features:
 * - Auto-price computation on batch creation
 * - Bulk recalculation when margins/costs change
 * - Manual price override support
 * - Cost change detection for smart prompts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { Decimal } from 'decimal.js';
import logger from '../utils/logger.js';
import { PricingService } from './pricingService.js';

const prisma = new PrismaClient();

export interface BatchPriceInput {
  batchId: string;
  manualPrice?: number;
  useProductFormula?: boolean;
}

export interface CostChangeAnalysis {
  productId: string;
  productName: string;
  previousAverageCost: number;
  newAverageCost: number;
  percentChange: number;
  affectedBatches: number;
  suggestRecalculation: boolean;
}

export class BatchPricingService {
  /**
   * Calculate selling price for a batch using product formula
   * Falls back to product selling price if no formula
   */
  static async calculateBatchPrice(
    productId: string,
    batchCostPrice: number
  ): Promise<number> {
    try {
      // Validate inputs
      if (batchCostPrice < 0) {
        throw new Error('Batch cost price cannot be negative');
      }

      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          pricingFormula: true,
          sellingPrice: true,
          costPrice: true,
          averageCost: true,
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // If product has a pricing formula, evaluate it with batch cost
      if (product.pricingFormula) {
        // Temporarily override cost for formula evaluation
        const costDecimal = new Decimal(batchCostPrice);
        const lastCostDecimal = new Decimal(product.averageCost || batchCostPrice);
        const sellingPriceDecimal = new Decimal(product.sellingPrice);

        const context = {
          cost: costDecimal.toNumber(),
          lastCost: lastCostDecimal.toNumber(),
          sellingPrice: sellingPriceDecimal.toNumber(),
          quantity: 1,
          Math,
        };

        // Reuse PricingService's safe evaluation
        const result = await PricingService.evaluateFormula(
          product.pricingFormula,
          productId,
          1
        );

        // Validate and round
        if (result < 0) {
          logger.warn('Batch price formula returned negative, using 0', {
            productId,
            batchCostPrice,
            formula: product.pricingFormula,
          });
          return 0;
        }

        return Math.round(result * 100) / 100;
      }

      // Fallback: use product selling price
      return new Decimal(product.sellingPrice).toNumber();
    } catch (error) {
      logger.error('Failed to calculate batch price', { error, productId, batchCostPrice });
      throw error;
    }
  }

  /**
   * Set batch price (auto-computed or manual override)
   */
  static async setBatchPrice(
    input: BatchPriceInput,
    trx?: Prisma.TransactionClient
  ): Promise<number> {
    const client = (trx || prisma) as PrismaClient;

    try {
      const batch = await client.inventoryBatch.findUnique({
        where: { id: input.batchId },
      });

      if (!batch) {
        throw new Error('Batch not found');
      }

      let sellingPrice: number;

      if (input.manualPrice !== undefined) {
        // Manual override
        if (input.manualPrice < 0) {
          throw new Error('Manual price cannot be negative');
        }
        sellingPrice = Math.round(input.manualPrice * 100) / 100;

        await client.inventoryBatch.update({
          where: { id: input.batchId },
          data: {
            sellingPrice,
            autoPrice: false, // Disable auto-pricing
          } as any, // Cast until Prisma Client regenerates
        });

        logger.info('Batch price set manually', {
          batchId: input.batchId,
          sellingPrice,
        });
      } else {
        // Auto-compute
        const costPrice = new Decimal(batch.costPrice).toNumber();
        sellingPrice = await this.calculateBatchPrice(batch.productId, costPrice);

        await client.inventoryBatch.update({
          where: { id: input.batchId },
          data: {
            sellingPrice,
            autoPrice: true,
          } as any,
        });

        logger.info('Batch price auto-computed', {
          batchId: input.batchId,
          costPrice,
          sellingPrice,
        });
      }

      return sellingPrice;
    } catch (error) {
      logger.error('Failed to set batch price', { error, input });
      throw error;
    }
  }

  /**
   * Bulk recalculate prices for all auto-priced batches of a product
   * Useful when margin/formula changes
   */
  static async bulkRecalculatePrices(productId: string): Promise<number> {
    try {
      const batches = await prisma.inventoryBatch.findMany({
        where: {
          productId,
          autoPrice: true,
          status: 'ACTIVE',
        } as any,
      });

      if (batches.length === 0) {
        logger.info('No auto-priced batches to recalculate', { productId });
        return 0;
      }

      let updated = 0;

      await prisma.$transaction(async (tx) => {
        for (const batch of batches) {
          const costPrice = new Decimal(batch.costPrice).toNumber();
          const newPrice = await this.calculateBatchPrice(productId, costPrice);

          // Only update if price changed
          const currentPrice = batch.sellingPrice
            ? new Decimal(batch.sellingPrice).toNumber()
            : 0;

          if (Math.abs(newPrice - currentPrice) > 0.01) {
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: { sellingPrice: newPrice },
            });
            updated++;
          }
        }
      });

      logger.info('Bulk batch prices recalculated', { productId, updated, total: batches.length });
      return updated;
    } catch (error) {
      logger.error('Failed to bulk recalculate batch prices', { error, productId });
      throw error;
    }
  }

  /**
   * Analyze cost change and determine if recalculation prompt is needed
   * Returns analysis for smart admin prompt
   */
  static async analyzeCostChange(
    productId: string,
    newBatchCost: number
  ): Promise<CostChangeAnalysis | null> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          name: true,
          averageCost: true,
          inventoryBatches: {
            where: {
              autoPrice: true,
              status: 'ACTIVE',
            },
            select: { id: true },
          },
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      const previousCost = new Decimal(product.averageCost || 0);
      const newCost = new Decimal(newBatchCost);

      // Calculate percent change
      if (previousCost.eq(0)) {
        // First batch or no previous cost
        return null;
      }

      const difference = newCost.minus(previousCost);
      const percentChange = difference.div(previousCost).mul(100);

      // Threshold for suggestion: ±5% change
      const threshold = 5;
      const suggestRecalculation = Math.abs(percentChange.toNumber()) >= threshold;

      const analysis: CostChangeAnalysis = {
        productId,
        productName: product.name,
        previousAverageCost: previousCost.toNumber(),
        newAverageCost: newCost.toNumber(),
        percentChange: Math.round(percentChange.toNumber() * 100) / 100,
        affectedBatches: product.inventoryBatches.length,
        suggestRecalculation,
      };

      if (suggestRecalculation) {
        logger.info('Significant cost change detected', analysis);
      }

      return analysis;
    } catch (error) {
      logger.error('Failed to analyze cost change', { error, productId, newBatchCost });
      throw error;
    }
  }

  /**
   * Auto-price a batch on creation
   * Called during goods receipt finalization or direct batch creation
   */
  static async autoPriceBatch(
    batchId: string,
    trx?: Prisma.TransactionClient
  ): Promise<void> {
    const client = (trx || prisma) as PrismaClient;

    try {
      const batch = await client.inventoryBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw new Error('Batch not found');
      }

      if (!batch.autoPrice) {
        logger.debug('Batch has auto-price disabled, skipping', { batchId });
        return;
      }

      const costPrice = new Decimal(batch.costPrice).toNumber();
      const sellingPrice = await this.calculateBatchPrice(batch.productId, costPrice);

      await client.inventoryBatch.update({
        where: { id: batchId },
        data: { sellingPrice },
      });

      logger.info('Batch auto-priced on creation', {
        batchId,
        costPrice,
        sellingPrice,
      });
    } catch (error) {
      logger.error('Failed to auto-price batch', { error, batchId });
      // Don't throw - pricing failure shouldn't block batch creation
      logger.warn('Continuing without batch price', { batchId });
    }
  }
}
