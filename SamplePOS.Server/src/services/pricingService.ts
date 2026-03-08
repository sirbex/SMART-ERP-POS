// Pricing Service - Formula-Based Pricing & Tier Calculation
// Purpose: Calculate prices using formulas, customer groups, and quantity tiers
// Bank-grade precision using Decimal.js

import Decimal from 'decimal.js';
import { VM } from 'vm2';
import { pool as globalPool } from '../db/pool.js';
import { UnitOfWork } from '../db/unitOfWork.js';
import type pg from 'pg';
import logger from '../utils/logger.js';
import * as pricingCache from './pricingCacheService.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

interface PricingContext {
  productId: string;
  customerGroupId?: string | null;
  quantity?: number;
}

interface CalculatedPrice {
  price: Decimal;
  basePrice: Decimal;
  discount: Decimal;
  appliedTierId?: string | null;
  appliedTierName?: string | null;
  formula?: string | null;
}

interface PricingTierRow {
  id: string;
  product_id: string;
  customer_group_id: string | null;
  name: string | null;
  pricing_formula: string;
  calculated_price: string;
  min_quantity: string;
  max_quantity: string | null;
  is_active: boolean;
  valid_from: Date | null;
  valid_until: Date | null;
  priority: number;
}

interface ProductPricing {
  id: string;
  selling_price: string;
  cost_price: string;
  average_cost: string;
  last_cost: string;
  pricing_formula: string | null;
  auto_update_price: boolean;
  costing_method: 'FIFO' | 'AVCO' | 'STANDARD';
}

/**
 * Calculate price for customer using priority-based resolution with caching
 * @param context - Pricing context (product, customer group, quantity)
 * @returns Calculated price with base price, discount, and applied tier info
 * @throws Error if product not found
 * 
 * Pricing Resolution Priority:
 * 1. **Pricing Tier** (customer-specific quantity breaks)
 * 2. **Customer Group Discount** (percentage off base price)
 * 3. **Product Formula** (e.g., cost * 1.20 for 20% markup)
 * 4. **Base Selling Price** (fallback from products.selling_price)
 * 
 * Caching Strategy:
 * - Cache key: productId + customerGroupId + quantity
 * - TTL: 1 hour (pricingCacheService.ts)
 * - Expected hit rate: ~95% for high-volume products
 * - Cache invalidation: On cost/price updates
 * 
 * Formula Evaluation:
 * - Sandboxed VM2 execution for security
 * - Variables: cost, avgCost, lastCost, sellingPrice, quantity
 * - Example: "cost * 1.25" (25% markup on current cost)
 * 
 * Tier Matching:
 * - Active tiers only (valid_from <= now <= valid_until)
 * - Quantity range: min_quantity <= quantity <= max_quantity
 * - Highest priority wins if multiple matches
 * 
 * Performance: Sub-millisecond with cache, ~5-10ms cache miss
 * Precision: Bank-grade using Decimal.js (20 digits, ROUND_HALF_UP)
 */
export async function calculatePrice(context: PricingContext, dbPool?: pg.Pool | pg.PoolClient): Promise<CalculatedPrice> {
  const pool = dbPool || globalPool;
  const { productId, customerGroupId, quantity = 1 } = context;

  // Check cache first
  const cachedPrice = pricingCache.get(productId, customerGroupId, quantity);
  if (cachedPrice !== null) {
    return {
      price: new Decimal(cachedPrice),
      basePrice: new Decimal(cachedPrice),
      discount: new Decimal(0),
    };
  }

  // Get product details
  const productResult = await pool.query<ProductPricing>(
    `SELECT p.id, pv.selling_price, pv.cost_price, pv.average_cost, pv.last_cost, 
            pv.pricing_formula, pv.auto_update_price, pv.costing_method
     FROM products p
     LEFT JOIN product_valuation pv ON pv.product_id = p.id
     WHERE p.id = $1`,
    [productId]
  );

  if (productResult.rows.length === 0) {
    throw new Error(`Product ${productId} not found`);
  }

  const product = productResult.rows[0];
  const basePrice = new Decimal(product.selling_price);

  // 1. Check for pricing tier (highest priority)
  const tier = await findApplicableTier(productId, customerGroupId, quantity, pool);
  if (tier) {
    const tierPrice = new Decimal(tier.calculated_price);
    const discount = basePrice.minus(tierPrice);

    // Cache the result
    pricingCache.set(productId, tierPrice.toNumber(), customerGroupId, quantity);

    return {
      price: tierPrice,
      basePrice,
      discount: discount.gt(0) ? discount : new Decimal(0),
      appliedTierId: tier.id,
      appliedTierName: tier.name,
      formula: tier.pricing_formula,
    };
  }

  // 2. Check for customer group discount
  if (customerGroupId) {
    const groupResult = await pool.query(
      `SELECT discount_percentage FROM customer_groups 
       WHERE id = $1 AND is_active = TRUE`,
      [customerGroupId]
    );

    if (groupResult.rows.length > 0) {
      const discountPct = new Decimal(groupResult.rows[0].discount_percentage);
      const discount = basePrice.times(discountPct);
      const finalPrice = basePrice.minus(discount);

      // Cache the result
      pricingCache.set(productId, finalPrice.toNumber(), customerGroupId, quantity);

      return {
        price: finalPrice,
        basePrice,
        discount,
      };
    }
  }

  // 3. Check for product pricing formula
  if (product.pricing_formula) {
    try {
      const formulaPrice = await evaluateFormula(product.pricing_formula, productId, quantity);
      const price = new Decimal(formulaPrice);

      // Cache the result
      pricingCache.set(productId, price.toNumber(), customerGroupId, quantity);

      return {
        price,
        basePrice,
        discount: new Decimal(0),
        formula: product.pricing_formula,
      };
    } catch (error) {
      logger.error('Formula evaluation failed, using base price', {
        productId,
        formula: product.pricing_formula,
        error,
      });
    }
  }

  // 4. Fall back to base selling price
  pricingCache.set(productId, basePrice.toNumber(), customerGroupId, quantity);

  return {
    price: basePrice,
    basePrice,
    discount: new Decimal(0),
  };
}

/**
 * Find applicable pricing tier based on product, customer group, quantity, and date
 */
async function findApplicableTier(
  productId: string,
  customerGroupId: string | null | undefined,
  quantity: number,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<PricingTierRow | null> {
  const pool = dbPool || globalPool;
  const now = new Date();

  // Query for matching tiers with priority ordering
  const result = await pool.query<PricingTierRow>(
    `SELECT * FROM pricing_tiers
     WHERE product_id = $1
       AND is_active = TRUE
       AND min_quantity <= $2
       AND (max_quantity IS NULL OR max_quantity >= $2)
       AND (customer_group_id = $3 OR customer_group_id IS NULL)
       AND (valid_from IS NULL OR valid_from <= $4)
       AND (valid_until IS NULL OR valid_until >= $4)
     ORDER BY 
       CASE WHEN customer_group_id = $3 THEN 1 ELSE 2 END,
       priority DESC,
       min_quantity DESC
     LIMIT 1`,
    [productId, quantity, customerGroupId || null, now]
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Safely evaluate pricing formula using VM2 sandbox
 * Supports: cost, lastCost, sellingPrice, quantity, Math functions
 */
export async function evaluateFormula(
  formula: string,
  productId: string,
  quantity: number = 1,
  dbPool?: pg.Pool | pg.PoolClient
): Promise<number> {
  const pool = dbPool || globalPool;
  // Get product cost data
  const result = await pool.query<ProductPricing>(
    `SELECT pv.cost_price, pv.average_cost, pv.last_cost, pv.selling_price
     FROM product_valuation pv WHERE pv.product_id = $1`,
    [productId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Product ${productId} not found`);
  }

  const product = result.rows[0];

  // Create sandboxed context with available variables
  const context = {
    cost: parseFloat(product.average_cost) || parseFloat(product.cost_price),
    lastCost: parseFloat(product.last_cost) || parseFloat(product.cost_price),
    sellingPrice: parseFloat(product.selling_price),
    quantity,
    Math, // Allow Math functions (max, min, ceil, floor, etc.)
  };

  try {
    // Create VM2 sandbox for safe formula execution
    const vm = new VM({
      timeout: 1000, // 1 second timeout
      sandbox: context,
    });

    // Execute formula and get result
    const result = vm.run(formula);

    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Formula must return a finite number');
    }

    if (result < 0) {
      throw new Error('Formula result cannot be negative');
    }

    return result;
  } catch (error) {
    logger.error('Formula evaluation error', {
      formula,
      productId,
      context,
      error: (error as Error).message,
    });
    throw new Error(`Invalid formula: ${(error as Error).message}`);
  }
}

/**
 * Validate pricing formula syntax and safety
 */
export function validateFormula(formula: string): { valid: boolean; error?: string } {
  try {
    // Test context with sample values
    const testContext = {
      cost: 100,
      lastCost: 95,
      sellingPrice: 150,
      quantity: 1,
      Math,
    };

    const vm = new VM({
      timeout: 1000,
      sandbox: testContext,
    });

    const result = vm.run(formula);

    if (typeof result !== 'number' || !isFinite(result)) {
      return { valid: false, error: 'Formula must return a finite number' };
    }

    if (result < 0) {
      return { valid: false, error: 'Formula result cannot be negative' };
    }

    return { valid: true };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}

/**
 * Update calculated_price for all pricing tiers of a product (using existing client)
 * Core logic that can run within an external transaction.
 */
async function updatePricingTiersWithClient(client: pg.PoolClient, productId: string): Promise<void> {
  const tiersResult = await client.query<PricingTierRow>(
    `SELECT * FROM pricing_tiers WHERE product_id = $1 AND is_active = TRUE`,
    [productId]
  );

  for (const tier of tiersResult.rows) {
    try {
      const calculatedPrice = await evaluateFormula(tier.pricing_formula, productId, 1, client);

      await client.query(
        `UPDATE pricing_tiers 
         SET calculated_price = $1, updated_at = NOW() 
         WHERE id = $2`,
        [calculatedPrice, tier.id]
      );

      logger.debug('Pricing tier updated', {
        tierId: tier.id,
        formula: tier.pricing_formula,
        calculatedPrice,
      });
    } catch (error) {
      logger.error('Failed to update pricing tier', {
        tierId: tier.id,
        formula: tier.pricing_formula,
        error,
      });
      // Continue with other tiers even if one fails
    }
  }

  logger.info('Pricing tiers updated', { productId, tierCount: tiersResult.rows.length });
}

/**
 * Update calculated_price for all pricing tiers of a product
 * Called when product cost changes. Creates its own transaction.
 */
export async function updatePricingTiers(productId: string, dbPool?: pg.Pool): Promise<void> {
  const pool = dbPool || globalPool;
  await UnitOfWork.run<void>(pool, async (client) => {
    await updatePricingTiersWithClient(client, productId);
  });
}

/**
 * Update product selling_price using its pricing formula
 * Called when auto_update_price is true and cost changes
 */
export async function updateProductPrice(productId: string, dbPool?: pg.Pool | pg.PoolClient): Promise<void> {
  const pool = dbPool || globalPool;
  const result = await pool.query<ProductPricing>(
    `SELECT pv.pricing_formula, pv.auto_update_price FROM product_valuation pv WHERE pv.product_id = $1`,
    [productId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Product ${productId} not found`);
  }

  const product = result.rows[0];

  if (!product.auto_update_price || !product.pricing_formula) {
    return; // Nothing to update
  }

  try {
    const newPrice = await evaluateFormula(product.pricing_formula, productId);

    await pool.query(`UPDATE product_valuation SET selling_price = $1, updated_at = NOW() WHERE product_id = $2`, [
      newPrice,
      productId,
    ]);

    logger.info('Product price auto-updated', {
      productId,
      formula: product.pricing_formula,
      newPrice,
    });
  } catch (error) {
    logger.error('Failed to auto-update product price', {
      productId,
      formula: product.pricing_formula,
      error,
    });
    throw error;
  }
}

/**
 * Handle cost change event - update prices and invalidate cache
 * Called after goods receipt finalization.
 * Both tier updates and product price update are atomic.
 */
export async function onCostChange(productId: string): Promise<void> {
  try {
    // Pricing tier updates + product price update in single transaction
    await UnitOfWork.run<void>(globalPool, async (client) => {
      await updatePricingTiersWithClient(client, productId);
      await updateProductPrice(productId, client);
    });

    // Invalidate cache after successful commit
    pricingCache.invalidateProduct(productId);

    logger.info('Cost change processed', { productId });
  } catch (error) {
    logger.error('Failed to process cost change', { error, productId });
    throw error;
  }
}

/**
 * Get price for a specific customer (convenience method)
 */
export async function getCustomerPrice(
  productId: string,
  customerId: string,
  quantity: number = 1,
  dbPool?: pg.Pool
): Promise<CalculatedPrice> {
  const pool = dbPool || globalPool;
  // Get customer's group
  const result = await pool.query(`SELECT customer_group_id FROM customers WHERE id = $1`, [
    customerId,
  ]);

  const customerGroupId = result.rows[0]?.customer_group_id || null;

  return await calculatePrice({
    productId,
    customerGroupId,
    quantity,
  });
}

/**
 * Calculate prices for multiple items in bulk (for cart/order)
 */
export async function calculateBulkPrices(
  items: Array<{ productId: string; quantity: number }>,
  customerGroupId?: string | null
): Promise<Map<string, CalculatedPrice>> {
  const prices = new Map<string, CalculatedPrice>();

  for (const item of items) {
    const price = await calculatePrice({
      productId: item.productId,
      customerGroupId,
      quantity: item.quantity,
    });
    prices.set(item.productId, price);
  }

  return prices;
}
