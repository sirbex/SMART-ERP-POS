import prisma from '../config/database.js';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../utils/logger.js';
import { PricingCacheService } from './pricingCacheService.js';

export interface PricingContext {
  productId: string;
  customerGroupId?: string | null;
  quantity?: number;
  date?: Date;
}

export interface CalculatedPrice {
  price: number;
  tierName?: string;
  formula?: string;
  appliedDiscount?: number;
}

/**
 * Pricing Service - Calculates selling prices using formulas and customer groups
 * 
 * Supports:
 * - Formula-based pricing (e.g., "cost * 1.20", "cost + 50")
 * - Customer group-specific pricing
 * - Quantity-based pricing tiers
 * - Time-based validity periods
 */
export class PricingService {
  
  /**
   * Calculate selling price for a product based on context
   * Uses Decimal for precision in financial calculations
   */
  static async calculatePrice(context: PricingContext): Promise<CalculatedPrice> {
    try {
      const { productId, customerGroupId, quantity = 1, date = new Date() } = context;

      // Validate quantity
      if (quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // Check cache first
      const cachedPrice = PricingCacheService.get(productId, customerGroupId, quantity);
      if (cachedPrice !== null) {
        return { price: cachedPrice };
      }

      // Get product with pricing info
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: {
          pricingTiers: {
            where: {
              isActive: true,
              OR: [
                { validFrom: null, validUntil: null },
                { validFrom: { lte: date }, validUntil: { gte: date } },
                { validFrom: { lte: date }, validUntil: null },
                { validFrom: null, validUntil: { gte: date } },
              ],
            },
            orderBy: { priority: 'desc' },
          },
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      let result: CalculatedPrice;

      // Find matching pricing tier
      const matchingTier = this.findMatchingTier(
        product.pricingTiers,
        customerGroupId,
        quantity
      );

      if (matchingTier) {
        // Use tier-specific pricing with Decimal precision
        const tierPrice = new Decimal(matchingTier.calculatedPrice);
        
        // Validate price is non-negative
        if (tierPrice.lessThan(0)) {
          logger.warn('Negative tier price detected, using 0', { 
            tierId: matchingTier.id, 
            calculatedPrice: matchingTier.calculatedPrice 
          });
          result = {
            price: 0,
            tierName: matchingTier.name || 'Custom Tier',
            formula: matchingTier.pricingFormula,
          };
        } else {
          result = {
            price: tierPrice.toNumber(),
            tierName: matchingTier.name || 'Custom Tier',
            formula: matchingTier.pricingFormula,
          };
        }
      } else if (customerGroupId) {
        // Check customer group discount with Decimal precision
        const customerGroup = await prisma.customerGroup.findUnique({
          where: { id: customerGroupId, isActive: true },
        });

        const basePrice = new Decimal(product.sellingPrice);
        
        if (customerGroup) {
          const discount = new Decimal(customerGroup.discount);
          
          if (discount.greaterThan(0)) {
            // Calculate discount: price * (1 - discount)
            const discountMultiplier = new Decimal(1).minus(discount);
            const finalPrice = basePrice.times(discountMultiplier);
            
            // Validate non-negative
            if (finalPrice.lessThan(0)) {
              logger.warn('Negative discounted price, using 0', { 
                basePrice: basePrice.toNumber(), 
                discount: discount.toNumber() 
              });
              result = {
                price: 0,
                appliedDiscount: discount.toNumber(),
              };
            } else {
              result = {
                price: finalPrice.toNumber(),
                appliedDiscount: discount.toNumber(),
              };
            }
          } else {
            result = { price: basePrice.toNumber() };
          }
        } else {
          result = { price: basePrice.toNumber() };
        }
      } else if (product.pricingFormula) {
        // Use product's default pricing formula if exists
        const formulaPrice = await this.evaluateFormula(
          product.pricingFormula,
          productId,
          quantity
        );
        result = {
          price: formulaPrice,
          formula: product.pricingFormula,
        };
      } else {
        // Fall back to product's selling price
        const sellingPrice = new Decimal(product.sellingPrice);
        result = {
          price: sellingPrice.toNumber(),
        };
      }

      // Validate final price is non-negative
      if (result.price < 0) {
        logger.error('Final price is negative, setting to 0', { result, context });
        result.price = 0;
      }

      // Cache the result
      PricingCacheService.set(productId, result.price, customerGroupId, quantity);

      return result;
    } catch (error) {
      logger.error('Failed to calculate price', { error, context });
      throw error;
    }
  }

  /**
   * Find the best matching pricing tier using Decimal precision
   */
  private static findMatchingTier(
    tiers: any[],
    customerGroupId?: string | null,
    quantity: number = 1
  ): any | null {
    // Convert quantity to Decimal for precise comparison
    const qtyDecimal = new Decimal(quantity);

    // Filter tiers by customer group and quantity
    let candidates = tiers.filter(tier => {
      const groupMatch = !tier.customerGroupId || tier.customerGroupId === customerGroupId;
      
      // Use Decimal for quantity comparisons to avoid floating-point issues
      const minQty = new Decimal(tier.minQuantity);
      const maxQty = tier.maxQuantity ? new Decimal(tier.maxQuantity) : null;
      
      const qtyMatch = 
        qtyDecimal.greaterThanOrEqualTo(minQty) &&
        (!maxQty || qtyDecimal.lessThanOrEqualTo(maxQty));
      
      return groupMatch && qtyMatch;
    });

    if (candidates.length === 0) return null;

    // Return highest priority tier (already sorted by priority desc)
    return candidates[0];
  }

  /**
   * Evaluate pricing formula with product context
   * Uses Decimal for precise cost calculations, converts to number for formula evaluation
   * 
   * Supported variables:
   * - cost: Current average cost
   * - lastCost: Most recent purchase cost
   * - sellingPrice: Current selling price
   * - quantity: Order quantity
   * 
   * Examples:
   * - "cost * 1.20" - 20% markup on cost
   * - "cost + 50" - Add fixed margin
   * - "lastCost * 1.15" - 15% markup on last cost
   * - "sellingPrice * 0.9" - 10% discount
   */
  static async evaluateFormula(
    formula: string,
    productId: string,
    quantity: number = 1
  ): Promise<number> {
    try {
      // Validate inputs
      if (!formula || formula.trim() === '') {
        throw new Error('Formula cannot be empty');
      }
      if (quantity <= 0) {
        throw new Error('Quantity must be greater than 0');
      }

      // Get product data
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          averageCost: true,
          lastCost: true,
          costPrice: true,
          sellingPrice: true,
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Use Decimal for precision, convert to number only for formula evaluation
      // Formula evaluation requires number, but we ensure precision before conversion
      const averageCostDecimal = new Decimal(product.averageCost || 0);
      const lastCostDecimal = new Decimal(product.lastCost || 0);
      const costPriceDecimal = new Decimal(product.costPrice || 0);
      const sellingPriceDecimal = new Decimal(product.sellingPrice || 0);

      // Prepare variables with proper precision handling
      // Use averageCost as primary cost, fallback to costPrice
      const cost = averageCostDecimal.greaterThan(0) 
        ? averageCostDecimal.toNumber() 
        : costPriceDecimal.toNumber();
      
      const lastCost = lastCostDecimal.greaterThan(0) 
        ? lastCostDecimal.toNumber() 
        : cost;
      
      const sellingPrice = sellingPriceDecimal.toNumber();

      // Create evaluation context
      const context = {
        cost,
        lastCost,
        sellingPrice,
        quantity,
        Math, // Allow Math functions
      };

      // Evaluate formula safely
      const result = this.safeEval(formula, context);

      // Validate result
      if (typeof result !== 'number' || isNaN(result)) {
        logger.warn('Formula returned invalid number, using selling price', { 
          formula, 
          result, 
          productId 
        });
        return sellingPrice;
      }

      if (result < 0) {
        logger.warn('Formula returned negative price, using 0', { 
          formula, 
          result, 
          productId 
        });
        return 0;
      }

      // Round to 2 decimal places for currency precision
      return Math.round(result * 100) / 100;
    } catch (error) {
      logger.error('Failed to evaluate formula', { error, formula, productId });
      throw error;
    }
  }

  /**
   * Evaluate a pricing formula with optional variable overrides.
   * Useful for batch-level pricing where cost should be the batch cost.
   */
  static async evaluateFormulaWithOverrides(
    formula: string,
    productId: string,
    overrides: Partial<{ cost: number; lastCost: number; sellingPrice: number; quantity: number }>
  ): Promise<number> {
    try {
      if (!formula || formula.trim() === '') {
        throw new Error('Formula cannot be empty');
      }

      // Get product data for defaults
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: {
          averageCost: true,
          lastCost: true,
          costPrice: true,
          sellingPrice: true,
        },
      });

      if (!product) {
        throw new Error('Product not found');
      }

      // Defaults derived from product
      const averageCostDecimal = new Decimal(product.averageCost || 0);
      const costDefault = averageCostDecimal.greaterThan(0)
        ? averageCostDecimal.toNumber()
        : new Decimal(product.costPrice || 0).toNumber();
      const lastCostDefault = new Decimal(product.lastCost || costDefault).toNumber();
      const sellingDefault = new Decimal(product.sellingPrice || 0).toNumber();

      // Apply overrides
      const cost = typeof overrides.cost === 'number' ? overrides.cost : costDefault;
      const lastCost = typeof overrides.lastCost === 'number' ? overrides.lastCost : lastCostDefault;
      const sellingPrice = typeof overrides.sellingPrice === 'number' ? overrides.sellingPrice : sellingDefault;
      const quantity = typeof overrides.quantity === 'number' ? overrides.quantity : 1;

      const context = { cost, lastCost, sellingPrice, quantity, Math };

      const result = this.safeEval(formula, context);

      if (typeof result !== 'number' || isNaN(result)) {
        logger.warn('Formula returned invalid number, using selling price', {
          formula,
          result,
          productId,
          context,
        });
        return sellingPrice;
      }

      if (result < 0) {
        logger.warn('Formula returned negative price, using 0', {
          formula,
          result,
          productId,
          context,
        });
        return 0;
      }

      return Math.round(result * 100) / 100;
    } catch (error) {
      logger.error('Failed to evaluate formula with overrides', { error, formula, productId, overrides });
      throw error;
    }
  }

  /**
   * Safe formula evaluation with restricted scope
   */
  private static safeEval(formula: string, context: any): number {
    try {
      // Create function with restricted scope
      const keys = Object.keys(context);
      const values = Object.values(context);
      
      // Remove dangerous keywords
      if (
        formula.includes('import') ||
        formula.includes('require') ||
        formula.includes('eval') ||
        formula.includes('Function')
      ) {
        throw new Error('Formula contains forbidden keywords');
      }

      const func = new Function(...keys, `return (${formula});`);
      return func(...values);
    } catch (error) {
      logger.error('Formula evaluation error', { error, formula });
      throw new Error(`Invalid formula: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update all pricing tiers for a product when cost changes
   * Uses transaction for atomicity
   */
  static async updatePricingTiers(productId: string): Promise<void> {
    try {
      const tiers = await prisma.pricingTier.findMany({
        where: { productId, isActive: true },
      });

      if (tiers.length === 0) {
        logger.info('No active pricing tiers to update', { productId });
        return;
      }

      // Update all tiers in a transaction for consistency
      await prisma.$transaction(async (tx) => {
        for (const tier of tiers) {
          // Use Decimal for minQuantity conversion
          const minQty = new Decimal(tier.minQuantity).toNumber();
          
          const calculatedPrice = await this.evaluateFormula(
            tier.pricingFormula,
            productId,
            minQty
          );

          await tx.pricingTier.update({
            where: { id: tier.id },
            data: { calculatedPrice },
          });
        }
      });

      logger.info('Pricing tiers updated', { productId, tiersUpdated: tiers.length });
    } catch (error) {
      logger.error('Failed to update pricing tiers', { error, productId });
      throw error;
    }
  }

  /**
   * Update product's selling price using its formula
   * Only updates if autoUpdatePrice is enabled
   */
  static async updateProductPrice(productId: string): Promise<void> {
    try {
      const product = await prisma.product.findUnique({
        where: { id: productId },
        select: { pricingFormula: true, autoUpdatePrice: true, sellingPrice: true },
      });

      if (!product?.pricingFormula || !product.autoUpdatePrice) {
        logger.debug('Skipping price update - no formula or auto-update disabled', { 
          productId, 
          hasFormula: !!product?.pricingFormula, 
          autoUpdate: product?.autoUpdatePrice 
        });
        return;
      }

      const calculatedPrice = await this.evaluateFormula(
        product.pricingFormula,
        productId
      );

      // Only update if price changed (avoid unnecessary writes)
      const currentPrice = new Decimal(product.sellingPrice);
      const newPrice = new Decimal(calculatedPrice);

      if (!currentPrice.equals(newPrice)) {
        await prisma.product.update({
          where: { id: productId },
          data: { sellingPrice: calculatedPrice },
        });

        logger.info('Product price auto-updated', { 
          productId, 
          oldPrice: currentPrice.toNumber(), 
          newPrice: newPrice.toNumber() 
        });
      } else {
        logger.debug('Price unchanged, skipping update', { 
          productId, 
          price: currentPrice.toNumber() 
        });
      }
    } catch (error) {
      logger.error('Failed to auto-update product price', { error, productId });
      throw error;
    }
  }

  /**
   * Trigger price recalculation when cost changes
   */
  static async onCostChange(productId: string): Promise<void> {
    try {
      // Invalidate cache for this product
      PricingCacheService.invalidateProduct(productId);

      // Update product's selling price if auto-update enabled
      await this.updateProductPrice(productId);

      // Update all pricing tiers
      await this.updatePricingTiers(productId);

      logger.info('Price recalculation completed', { productId });
    } catch (error) {
      logger.error('Failed to recalculate prices on cost change', { error, productId });
      throw error;
    }
  }

  /**
   * Validate pricing formula syntax
   */
  static validateFormula(formula: string): { valid: boolean; error?: string } {
    try {
      // Check for forbidden keywords
      if (
        formula.includes('import') ||
        formula.includes('require') ||
        formula.includes('eval') ||
        formula.includes('Function')
      ) {
        return { valid: false, error: 'Formula contains forbidden keywords' };
      }

      // Test with dummy values
      const testContext = {
        cost: 100,
        lastCost: 100,
        sellingPrice: 120,
        quantity: 1,
        Math,
      };

      this.safeEval(formula, testContext);
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid formula',
      };
    }
  }

  /**
   * Get effective price for customer
   */
  static async getCustomerPrice(
    productId: string,
    customerId: string,
    quantity: number = 1
  ): Promise<CalculatedPrice> {
    try {
      // Get customer's group
      const customer = await prisma.customer.findUnique({
        where: { id: customerId },
        select: { customerGroupId: true },
      });

      return this.calculatePrice({
        productId,
        customerGroupId: customer?.customerGroupId,
        quantity,
      });
    } catch (error) {
      logger.error('Failed to get customer price', { error, productId, customerId });
      throw error;
    }
  }

  /**
   * Bulk price calculation for multiple products
   */
  static async calculateBulkPrices(
    items: Array<{ productId: string; quantity: number }>,
    customerGroupId?: string
  ): Promise<Map<string, CalculatedPrice>> {
    const prices = new Map<string, CalculatedPrice>();

    for (const item of items) {
      const price = await this.calculatePrice({
        productId: item.productId,
        customerGroupId,
        quantity: item.quantity,
      });
      prices.set(item.productId, price);
    }

    return prices;
  }
}
