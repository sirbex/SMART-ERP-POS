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

import prisma from '../config/database.js';
import { Decimal } from 'decimal.js';
import logger from '../utils/logger.js';
import { PricingService } from './pricingService.js';
type TxClient = any;

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

      // If product has a pricing formula, evaluate it with BATCH COST overrides
      if (product.pricingFormula) {
        const result = await PricingService.evaluateFormulaWithOverrides(
          product.pricingFormula,
          productId,
          {
            cost: new Decimal(batchCostPrice).toNumber(),
            // Prefer batch cost as lastCost baseline when overriding
            lastCost: new Decimal(batchCostPrice).toNumber(),
            sellingPrice: new Decimal(product.sellingPrice || 0).toNumber(),
            quantity: 1,
          }
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

  // Fallback: use product selling price (rounded 2dp)
  return new Decimal(product.sellingPrice).toDecimalPlaces(2).toNumber();
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
    trx?: TxClient
  ): Promise<number> {
    const client = (trx || prisma) as any;

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
            // Mirror manual price to retailPrice for consistency; wholesale left unchanged
            retailPrice: sellingPrice,
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
        // Base retail from product formula
        const baseRetail = await this.calculateBatchPrice(batch.productId, costPrice);

        // Compute group-specific prices (retail/wholesale) like in autoPriceBatch
        const groups = await prisma.customerGroup.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
        });
        const retailGroup = groups.find((g) => g.name.toLowerCase() === 'retail');
        const wholesaleGroup = groups.find((g) => g.name.toLowerCase() === 'wholesale');

        let retailPrice = baseRetail;
        let wholesalePrice: number | null = null;

        const computeGroupPrice = async (groupId: string): Promise<number | null> => {
          const tier = await prisma.pricingTier.findFirst({
            where: { productId: batch.productId, customerGroupId: groupId, isActive: true },
            orderBy: { priority: 'desc' },
          });
          if (!tier) return null;
          if (!tier.pricingFormula) return new Decimal(tier.calculatedPrice).toNumber();
          const price = await PricingService.evaluateFormulaWithOverrides(
            tier.pricingFormula,
            batch.productId,
            { cost: costPrice, lastCost: costPrice, quantity: 1 }
          );
          return price;
        };

        if (retailGroup) {
          const p = await computeGroupPrice(retailGroup.id);
          if (typeof p === 'number') retailPrice = p;
        }
        if (wholesaleGroup) {
          const p = await computeGroupPrice(wholesaleGroup.id);
          if (typeof p === 'number') wholesalePrice = p;
        }

        sellingPrice = retailPrice; // for backward compatibility

        await client.inventoryBatch.update({
          where: { id: input.batchId },
          data: {
            sellingPrice,
            retailPrice,
            wholesalePrice: wholesalePrice ?? null,
            autoPrice: true,
          } as any,
        });

        logger.info('Batch price auto-computed', {
          batchId: input.batchId,
          costPrice,
          retailPrice,
          wholesalePrice,
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
          const baseRetail = await this.calculateBatchPrice(productId, costPrice);

          // Compute retail/wholesale per batch
          const groups = await prisma.customerGroup.findMany({
            where: { isActive: true },
            select: { id: true, name: true },
          });
          const retailGroup = groups.find((g) => g.name.toLowerCase() === 'retail');
          const wholesaleGroup = groups.find((g) => g.name.toLowerCase() === 'wholesale');

          let retailPrice = baseRetail;
          let wholesalePrice: number | null = null;

          const computeGroupPrice = async (groupId: string): Promise<number | null> => {
            const tier = await prisma.pricingTier.findFirst({
              where: { productId, customerGroupId: groupId, isActive: true },
              orderBy: { priority: 'desc' },
            });
            if (!tier) return null;
            if (!tier.pricingFormula) return new Decimal(tier.calculatedPrice).toNumber();
            const price = await PricingService.evaluateFormulaWithOverrides(
              tier.pricingFormula,
              productId,
              { cost: costPrice, lastCost: costPrice, quantity: 1 }
            );
            return price;
          };

          if (retailGroup) {
            const p = await computeGroupPrice(retailGroup.id);
            if (typeof p === 'number') retailPrice = p;
          }
          if (wholesaleGroup) {
            const p = await computeGroupPrice(wholesaleGroup.id);
            if (typeof p === 'number') wholesalePrice = p;
          }

          const currentRetail = (batch as any).retailPrice != null ? new Decimal((batch as any).retailPrice).toNumber() : (batch as any).sellingPrice != null ? new Decimal((batch as any).sellingPrice).toNumber() : 0;
          const currentWholesale = (batch as any).wholesalePrice != null ? new Decimal((batch as any).wholesalePrice).toNumber() : null;

          const retailChanged = Math.abs(retailPrice - currentRetail) > 0.01;
          const wholesaleChanged = (wholesalePrice == null && currentWholesale != null) || (wholesalePrice != null && (currentWholesale == null || Math.abs(wholesalePrice - currentWholesale) > 0.01));

          if (retailChanged || wholesaleChanged) {
            await tx.inventoryBatch.update({
              where: { id: batch.id },
              data: {
                sellingPrice: retailPrice,
                retailPrice: retailPrice,
                wholesalePrice: wholesalePrice ?? null,
              } as any,
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
            } as any,
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
    trx?: TxClient
  ): Promise<void> {
    const client = (trx || prisma) as any;

    try {
      const batch = await client.inventoryBatch.findUnique({
        where: { id: batchId },
      });

      if (!batch) {
        throw new Error('Batch not found');
      }

      if (!(batch as any).autoPrice) {
        logger.debug('Batch has auto-price disabled, skipping', { batchId });
        return;
      }

      const costPrice = new Decimal(batch.costPrice).toNumber();

      // Base price from product formula (retail fallback)
      const baseRetail = await this.calculateBatchPrice(batch.productId, costPrice);

      // Attempt to compute group-specific prices using tier formulas with batch cost overrides
      // Find Retail and Wholesale groups by name (case-insensitive)
      const groups = await prisma.customerGroup.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
      });

      const retailGroup = groups.find((g) => g.name.toLowerCase() === 'retail');
      const wholesaleGroup = groups.find((g) => g.name.toLowerCase() === 'wholesale');

      let retailPrice = baseRetail;
      let wholesalePrice: number | null = null;

      // Helper to compute price from a group's top priority tier (min qty 1) using batch cost
      const computeGroupPrice = async (groupId: string): Promise<number | null> => {
        const tier = await prisma.pricingTier.findFirst({
          where: {
            productId: batch.productId,
            customerGroupId: groupId,
            isActive: true,
          },
          orderBy: { priority: 'desc' },
        });
        if (!tier) return null;
        if (!tier.pricingFormula) return new Decimal(tier.calculatedPrice).toNumber();
        const price = await PricingService.evaluateFormulaWithOverrides(
          tier.pricingFormula,
          batch.productId,
          { cost: costPrice, lastCost: costPrice, quantity: 1 }
        );
        return price;
      };

      if (retailGroup) {
        const p = await computeGroupPrice(retailGroup.id);
        if (typeof p === 'number') retailPrice = p;
      }

      if (wholesaleGroup) {
        const p = await computeGroupPrice(wholesaleGroup.id);
        if (typeof p === 'number') wholesalePrice = p;
      }

      await client.inventoryBatch.update({
        where: { id: batchId },
        data: {
          // Keep existing field for backward compatibility (use retail as default)
          sellingPrice: retailPrice,
          retailPrice: retailPrice,
          wholesalePrice: wholesalePrice ?? null,
        } as any,
      });

      logger.info('Batch auto-priced on creation', {
        batchId,
        costPrice,
        retailPrice,
        wholesalePrice,
      });
    } catch (error) {
      logger.error('Failed to auto-price batch', { error, batchId });
      // Don't throw - pricing failure shouldn't block batch creation
      logger.warn('Continuing without batch price', { batchId });
    }
  }
}
