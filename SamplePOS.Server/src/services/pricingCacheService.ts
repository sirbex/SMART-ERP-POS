import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

/**
 * Pricing Cache Service - In-memory caching for computed prices
 * 
 * Reduces database load by caching calculated prices with TTL
 * Automatically invalidates on cost or formula changes
 */
export class PricingCacheService {
  private static cache = new NodeCache({
    stdTTL: 3600, // 1 hour default TTL
    checkperiod: 600, // Check for expired keys every 10 minutes
    useClones: false, // Return references for better performance
  });

  /**
   * Generate cache key for price lookup
   */
  private static getCacheKey(
    productId: string,
    customerGroupId?: string | null,
    quantity: number = 1
  ): string {
    return `price:${productId}:${customerGroupId || 'default'}:${quantity}`;
  }

  /**
   * Get cached price
   */
  static get(
    productId: string,
    customerGroupId?: string | null,
    quantity: number = 1
  ): number | null {
    const key = this.getCacheKey(productId, customerGroupId, quantity);
    const cached = this.cache.get<number>(key);
    
    if (cached !== undefined) {
      logger.debug('Price cache hit', { productId, customerGroupId, quantity });
      return cached;
    }
    
    logger.debug('Price cache miss', { productId, customerGroupId, quantity });
    return null;
  }

  /**
   * Set cached price
   */
  static set(
    productId: string,
    price: number,
    customerGroupId?: string | null,
    quantity: number = 1,
    ttl?: number
  ): void {
    const key = this.getCacheKey(productId, customerGroupId, quantity);
    const success = ttl !== undefined 
      ? this.cache.set(key, price, ttl)
      : this.cache.set(key, price);
    
    if (success) {
      logger.debug('Price cached', { productId, price, customerGroupId, quantity });
    }
  }

  /**
   * Invalidate all cached prices for a product
   */
  static invalidateProduct(productId: string): void {
    const keys = this.cache.keys();
    const productKeys = keys.filter(key => key.startsWith(`price:${productId}:`));
    
    this.cache.del(productKeys);
    
    logger.info('Product price cache invalidated', { 
      productId, 
      keysRemoved: productKeys.length 
    });
  }

  /**
   * Invalidate all cached prices for a customer group
   */
  static invalidateCustomerGroup(customerGroupId: string): void {
    const keys = this.cache.keys();
    const groupKeys = keys.filter(key => key.includes(`:${customerGroupId}:`));
    
    this.cache.del(groupKeys);
    
    logger.info('Customer group price cache invalidated', { 
      customerGroupId, 
      keysRemoved: groupKeys.length 
    });
  }

  /**
   * Invalidate entire cache
   */
  static invalidateAll(): void {
    this.cache.flushAll();
    logger.info('All price cache invalidated');
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return {
      keys: this.cache.keys().length,
      hits: this.cache.getStats().hits,
      misses: this.cache.getStats().misses,
      ksize: this.cache.getStats().ksize,
      vsize: this.cache.getStats().vsize,
    };
  }

  /**
   * Warm cache with commonly used prices
   */
  static async warmCache(
    productIds: string[],
    customerGroupIds?: string[]
  ): Promise<void> {
    try {
      // Import here to avoid circular dependency
      const { PricingService } = await import('./pricingService.js');
      
      const groups = customerGroupIds || [undefined];
      
      for (const productId of productIds) {
        for (const customerGroupId of groups) {
          try {
            const result = await PricingService.calculatePrice({
              productId,
              customerGroupId,
            });
            
            this.set(productId, result.price, customerGroupId);
          } catch (error) {
            logger.warn('Failed to warm cache for product', { 
              error, 
              productId, 
              customerGroupId 
            });
          }
        }
      }
      
      logger.info('Price cache warmed', { 
        productsWarmed: productIds.length,
        groupsWarmed: groups.length 
      });
    } catch (error) {
      logger.error('Failed to warm price cache', { error });
    }
  }
}
