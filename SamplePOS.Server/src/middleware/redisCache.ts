/**
 * Redis Cache Middleware
 * 
 * Caches GET requests and automatically invalidates on mutations.
 * Supports:
 * - Response caching with configurable TTL
 * - Pattern-based cache invalidation
 * - Cache hit/miss tracking
 * - Graceful degradation when Redis unavailable
 */

import { Request, Response, NextFunction } from 'express';
import redisCacheService from '../services/redisCacheService.js';
import logger from '../utils/logger.js';

interface CacheOptions {
  prefix?: string;
  ttl?: number;
  keyGenerator?: (req: Request) => string;
}

/**
 * Cache middleware for GET requests
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const { prefix = 'api', ttl = 300, keyGenerator } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      next();
      return;
    }

    try {
      // Generate cache key
      const cacheKey = keyGenerator 
        ? keyGenerator(req) 
        : redisCacheService.buildKey(prefix, req.path, JSON.stringify(req.query));

      // Try to get from cache
      const cachedData = await redisCacheService.get(cacheKey);
      
      if (cachedData) {
        logger.debug(`Cache HIT: ${cacheKey}`);
        res.setHeader('X-Cache', 'HIT');
        res.json(cachedData);
        return;
      }

      logger.debug(`Cache MISS: ${cacheKey}`);
      res.setHeader('X-Cache', 'MISS');

      // Store original json method
      const originalJson = res.json.bind(res);

      // Override json method to cache response
      res.json = function (body: any) {
        // Cache successful responses only
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisCacheService.set(cacheKey, body, ttl).catch(err => {
            logger.error(`Failed to cache response for ${cacheKey}:`, err);
          });
        }
        return originalJson(body);
      };

      next();
    } catch (error) {
      logger.error('Cache middleware error:', error);
      // Continue without caching on error
      next();
    }
  };
}

/**
 * Middleware to invalidate cache on mutations
 */
export function invalidateCacheMiddleware(patterns: string[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override json to invalidate cache after successful mutation
    res.json = function (body: any) {
      // Invalidate cache on successful mutations
      if (res.statusCode >= 200 && res.statusCode < 300) {
        Promise.all(patterns.map(pattern => redisCacheService.delPattern(pattern)))
          .catch(err => logger.error('Cache invalidation error:', err));
      }
      return originalJson(body);
    };

    next();
  };
}

/**
 * Helper to invalidate specific resource caches
 */
export const invalidateCache = {
  products: () => invalidateCacheMiddleware(['pos:product:*', 'pos:cache:*products*']),
  customers: () => invalidateCacheMiddleware(['pos:customer:*', 'pos:cache:*customers*']),
  sales: () => invalidateCacheMiddleware(['pos:sale:*', 'pos:cache:*sales*']),
  all: () => invalidateCacheMiddleware(['pos:*']),
};

export default cacheMiddleware;
