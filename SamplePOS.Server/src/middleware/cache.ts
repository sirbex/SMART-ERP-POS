/**
 * Cache Middleware
 * 
 * Automatically caches GET request responses
 * Skips caching for authenticated user-specific requests
 */

import { Request, Response, NextFunction } from 'express';
import CacheService from '../services/cacheService.js';
import logger from '../utils/logger.js';

interface CacheOptions {
  ttl?: number;
  keyPrefix?: string;
  skipCache?: (req: Request) => boolean;
}

/**
 * Create cache middleware for route
 * 
 * @param options Cache configuration options
 * @returns Express middleware function
 */
export function cacheMiddleware(options: CacheOptions = {}) {
  const { ttl, keyPrefix = 'api', skipCache } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }

    // Allow routes to skip caching based on custom logic
    if (skipCache && skipCache(req)) {
      return next();
    }

    // Generate cache key from request URL and query params
    const cacheKey = generateCacheKey(req, keyPrefix);

    // Try to get from cache
    const cachedResponse = CacheService.get<any>(cacheKey);

    if (cachedResponse) {
      // Cache hit - return cached response
      logger.debug('Cache middleware HIT', { cacheKey, path: req.path });
      return res.json(cachedResponse);
    }

    // Cache miss - continue to route handler
    logger.debug('Cache middleware MISS', { cacheKey, path: req.path });

    // Store original res.json function
    const originalJson = res.json.bind(res);

    // Override res.json to cache the response
    res.json = function (body: any) {
      // Only cache successful responses (status 200-299)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        CacheService.set(cacheKey, body, ttl);
        logger.debug('Cache middleware SET', { cacheKey, path: req.path, ttl: ttl || 'default' });
      }

      // Call original json function
      return originalJson(body);
    };

    next();
  };
}

/**
 * Generate cache key from request
 */
function generateCacheKey(req: Request, prefix: string): string {
  const path = req.path;
  const query = new URLSearchParams(req.query as any).toString();
  return `${prefix}:${path}${query ? `:${query}` : ''}`;
}

/**
 * Middleware to invalidate cache on mutations
 * Use this on POST, PUT, DELETE routes
 */
export function invalidateCacheMiddleware(patterns: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original send function
    const originalSend = res.send.bind(res);

    // Override send to invalidate cache after successful mutation
    res.send = function (body: any) {
      // Only invalidate on successful mutations (status 200-299)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        patterns.forEach(pattern => {
          const count = CacheService.clearPattern(pattern);
          logger.debug('Cache invalidation', { pattern, count, method: req.method, path: req.path });
        });
      }

      return originalSend(body);
    };

    next();
  };
}

/**
 * Helper to create cache invalidation middleware for common patterns
 */
export const invalidateCache = {
  products: invalidateCacheMiddleware(['api:/api/products']),
  customers: invalidateCacheMiddleware(['api:/api/customers']),
  suppliers: invalidateCacheMiddleware(['api:/api/suppliers']),
  inventory: invalidateCacheMiddleware(['api:/api/inventory']),
  all: invalidateCacheMiddleware(['api:']),
};

export default cacheMiddleware;
