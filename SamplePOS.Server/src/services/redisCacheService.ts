/**
 * Redis Cache Service
 * 
 * High-performance caching layer with:
 * - Typed cache keys and values
 * - Pattern-based invalidation
 * - Cache statistics and monitoring
 * - Graceful fallback when Redis unavailable
 */

import redisClient, { REDIS_PREFIXES, REDIS_TTL } from '../config/redis.js';
import logger from '../utils/logger.js';

export class RedisCacheService {
  /**
   * Get value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!redisClient.isOpen) {
        return null;
      }

      const value = await redisClient.get(key);
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error(`Cache GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with TTL
   */
  async set(key: string, value: unknown, ttl: number = REDIS_TTL.MEDIUM): Promise<boolean> {
    try {
      if (!redisClient.isOpen) {
        return false;
      }

      const serialized = JSON.stringify(value);
      await redisClient.setEx(key, ttl, serialized);
      return true;
    } catch (error) {
      logger.error(`Cache SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete specific key from cache
   */
  async del(key: string): Promise<boolean> {
    try {
      if (!redisClient.isOpen) {
        return false;
      }

      await redisClient.del(key);
      return true;
    } catch (error) {
      logger.error(`Cache DEL error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching pattern
   */
  async delPattern(pattern: string): Promise<number> {
    try {
      if (!redisClient.isOpen) {
        return 0;
      }

      const keys = await redisClient.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      await redisClient.del(keys);
      logger.info(`Cache invalidated ${keys.length} keys matching pattern: ${pattern}`);
      return keys.length;
    } catch (error) {
      logger.error(`Cache DEL pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate all product caches
   */
  async invalidateProducts(): Promise<number> {
    return this.delPattern(`${REDIS_PREFIXES.PRODUCT}*`);
  }

  /**
   * Invalidate all customer caches
   */
  async invalidateCustomers(): Promise<number> {
    return this.delPattern(`${REDIS_PREFIXES.CUSTOMER}*`);
  }

  /**
   * Invalidate all sale caches
   */
  async invalidateSales(): Promise<number> {
    return this.delPattern(`${REDIS_PREFIXES.SALE}*`);
  }

  /**
   * Invalidate specific product by ID
   */
  async invalidateProduct(id: string): Promise<number> {
    return this.delPattern(`${REDIS_PREFIXES.PRODUCT}*${id}*`);
  }

  /**
   * Invalidate specific customer by ID
   */
  async invalidateCustomer(id: string): Promise<number> {
    return this.delPattern(`${REDIS_PREFIXES.CUSTOMER}*${id}*`);
  }

  /**
   * Clear all cache
   */
  async flush(): Promise<boolean> {
    try {
      if (!redisClient.isOpen) {
        return false;
      }

      await redisClient.flushDb();
      logger.warn('⚠️  Redis cache flushed');
      return true;
    } catch (error) {
      logger.error('Cache FLUSH error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    hits: number;
    misses: number;
    keys: number;
    hitRate: string;
  }> {
    try {
      if (!redisClient.isOpen) {
        return { hits: 0, misses: 0, keys: 0, hitRate: '0%' };
      }

      const info = await redisClient.info('stats');
      const keys = await redisClient.dbSize();
      
      const hits = parseInt(info.match(/keyspace_hits:(\d+)/)?.[1] || '0', 10);
      const misses = parseInt(info.match(/keyspace_misses:(\d+)/)?.[1] || '0', 10);
      const total = hits + misses;
      const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : '0';

      return { hits, misses, keys, hitRate: `${hitRate}%` };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return { hits: 0, misses: 0, keys: 0, hitRate: '0%' };
    }
  }

  /**
   * Generate cache key with prefix
   */
  buildKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}${parts.join(':')}`;
  }
}

export default new RedisCacheService();
