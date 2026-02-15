// Pricing Cache Service - In-Memory Price Caching
// Purpose: High-performance price caching with intelligent invalidation
// Uses NodeCache for sub-millisecond lookups

import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

// Cache configuration
const DEFAULT_TTL = 3600; // 1 hour in seconds
const CHECK_PERIOD = 600; // Check for expired keys every 10 minutes

// Initialize cache
const priceCache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: CHECK_PERIOD,
  useClones: false, // Better performance, prices are immutable
});

// Track cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate cache key from pricing context
 */
function generateKey(
  productId: string,
  customerGroupId?: string | null,
  quantity?: number
): string {
  const group = customerGroupId || 'default';
  const qty = quantity || 1;
  return `price:${productId}:${group}:${qty}`;
}

/**
 * Get cached price
 * Returns null if not found
 */
export function get(
  productId: string,
  customerGroupId?: string | null,
  quantity?: number
): number | null {
  const key = generateKey(productId, customerGroupId, quantity);
  const value = priceCache.get<number>(key);

  if (value !== undefined) {
    cacheHits++;
    logger.debug('Price cache hit', { key, value });
    return value;
  }

  cacheMisses++;
  logger.debug('Price cache miss', { key });
  return null;
}

/**
 * Set cached price
 * @param ttl - Time to live in seconds (defaults to 1 hour)
 */
export function set(
  productId: string,
  price: number,
  customerGroupId?: string | null,
  quantity?: number,
  ttl: number = DEFAULT_TTL
): void {
  const key = generateKey(productId, customerGroupId, quantity);
  priceCache.set(key, price, ttl);

  logger.debug('Price cached', { key, price, ttl });
}

/**
 * Invalidate all cached prices for a product
 * Called when product cost or formula changes
 */
export function invalidateProduct(productId: string): void {
  const keys = priceCache.keys();
  let deleteCount = 0;

  for (const key of keys) {
    if (key.startsWith(`price:${productId}:`)) {
      priceCache.del(key);
      deleteCount++;
    }
  }

  logger.info('Product prices invalidated', { productId, deleteCount });
}

/**
 * Invalidate all cached prices for a customer group
 * Called when customer group discount changes
 */
export function invalidateCustomerGroup(customerGroupId: string): void {
  const keys = priceCache.keys();
  let deleteCount = 0;

  for (const key of keys) {
    if (key.includes(`:${customerGroupId}:`)) {
      priceCache.del(key);
      deleteCount++;
    }
  }

  logger.info('Customer group prices invalidated', { customerGroupId, deleteCount });
}

/**
 * Invalidate all cached prices
 * Use sparingly - only for system-wide price recalculations
 */
export function invalidateAll(): void {
  const keyCount = priceCache.keys().length;
  priceCache.flushAll();

  logger.warn('All prices invalidated', { keyCount });
}

/**
 * Get cache statistics
 */
export function getStats(): {
  keys: number;
  hits: number;
  misses: number;
  hitRate: number;
  ksize: number;
  vsize: number;
} {
  const stats = priceCache.getStats();
  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

  return {
    keys: stats.keys,
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: Math.round(hitRate * 100) / 100,
    ksize: stats.ksize,
    vsize: stats.vsize,
  };
}

/**
 * Reset cache statistics
 */
export function resetStats(): void {
  cacheHits = 0;
  cacheMisses = 0;

  logger.info('Cache statistics reset');
}

/**
 * Pre-load prices into cache for commonly used products
 * @param productIds - Array of product IDs to warm
 * @param customerGroupIds - Optional array of customer group IDs
 */
export async function warmCache(productIds: string[], customerGroupIds?: string[]): Promise<void> {
  // This function would be called with calculated prices from PricingService
  // For now, it's a placeholder that can be implemented when needed
  logger.info('Cache warming requested', {
    productCount: productIds.length,
    groupCount: customerGroupIds?.length || 0,
  });
}

/**
 * Get cache health metrics
 */
export function getHealthMetrics(): {
  isHealthy: boolean;
  hitRate: number;
  keyCount: number;
  memoryUsage: number;
} {
  const stats = getStats();
  const isHealthy = stats.hitRate >= 80 && stats.keys > 0;

  return {
    isHealthy,
    hitRate: stats.hitRate,
    keyCount: stats.keys,
    memoryUsage: stats.ksize + stats.vsize,
  };
}

// Log cache statistics periodically (every 5 minutes)
setInterval(() => {
  const stats = getStats();
  if (stats.hits + stats.misses > 0) {
    logger.info('Pricing cache stats', stats);
  }
}, 300000);

export default {
  get,
  set,
  invalidateProduct,
  invalidateCustomerGroup,
  invalidateAll,
  getStats,
  resetStats,
  warmCache,
  getHealthMetrics,
};
