/**
 * Cache Service
 * 
 * Provides a unified interface for caching operations
 * Abstracts the underlying cache implementation (node-cache, Redis, etc.)
 */

import cache from '../config/cache.js';
import logger from '../utils/logger.js';

/**
 * Cache key prefixes for different data types
 */
export const CacheKeys = {
  PRODUCTS: 'products',
  PRODUCT: 'product',
  CUSTOMERS: 'customers',
  CUSTOMER: 'customer',
  SUPPLIERS: 'suppliers',
  SUPPLIER: 'supplier',
  SETTINGS: 'settings',
  INVENTORY: 'inventory',
} as const;

/**
 * Cache TTL (Time To Live) in seconds
 */
export const CacheTTL = {
  SHORT: 60,        // 1 minute - frequently changing data
  MEDIUM: 300,      // 5 minutes - moderate changes
  LONG: 900,        // 15 minutes - rarely changing data
  VERY_LONG: 3600,  // 1 hour - very stable data
} as const;

export class CacheService {
  /**
   * Get value from cache
   */
  static get<T>(key: string): T | undefined {
    try {
      const value = cache.get<T>(key);
      if (value !== undefined) {
        logger.debug(`Cache HIT: ${key}`);
      } else {
        logger.debug(`Cache MISS: ${key}`);
      }
      return value;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return undefined;
    }
  }

  /**
   * Set value in cache with optional TTL
   */
  static set<T>(key: string, value: T, ttl?: number): boolean {
    try {
      const success = cache.set(key, value, ttl || 0);
      if (success) {
        logger.debug(`Cache SET: ${key}`, { ttl: ttl || 'default' });
      }
      return success;
    } catch (error) {
      logger.error('Cache set error', { key, error });
      return false;
    }
  }

  /**
   * Delete specific key from cache
   */
  static delete(key: string): number {
    try {
      const count = cache.del(key);
      logger.debug(`Cache DELETE: ${key}`, { count });
      return count;
    } catch (error) {
      logger.error('Cache delete error', { key, error });
      return 0;
    }
  }

  /**
   * Delete multiple keys
   */
  static deleteMany(keys: string[]): number {
    try {
      const count = cache.del(keys);
      logger.debug(`Cache DELETE MANY: ${keys.length} keys`, { count });
      return count;
    } catch (error) {
      logger.error('Cache delete many error', { keys, error });
      return 0;
    }
  }

  /**
   * Clear cache by pattern (e.g., 'products:*')
   */
  static clearPattern(pattern: string): number {
    try {
      const keys = cache.keys();
      const matchedKeys = keys.filter(key => key.startsWith(pattern.replace('*', '')));
      
      if (matchedKeys.length > 0) {
        const count = cache.del(matchedKeys);
        logger.info(`Cache CLEAR PATTERN: ${pattern}`, { count });
        return count;
      }
      return 0;
    } catch (error) {
      logger.error('Cache clear pattern error', { pattern, error });
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  static clearAll(): void {
    try {
      cache.flushAll();
      logger.info('Cache FLUSH ALL');
    } catch (error) {
      logger.error('Cache flush all error', { error });
    }
  }

  /**
   * Get cache statistics
   */
  static getStats() {
    return cache.getStats();
  }

  /**
   * Check if key exists in cache
   */
  static has(key: string): boolean {
    return cache.has(key);
  }

  /**
   * Get cache key for list endpoints with pagination
   */
  static getListKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:list:${sortedParams}`;
  }

  /**
   * Get cache key for single item
   */
  static getItemKey(prefix: string, id: string | number): string {
    return `${prefix}:${id}`;
  }
}

export default CacheService;
