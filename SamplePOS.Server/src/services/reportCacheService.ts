// Report Cache Service - In-Memory Report Result Caching
// Purpose: Cache expensive report queries to improve performance
// Uses NodeCache with shorter TTL for data freshness

import NodeCache from 'node-cache';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { getBusinessDate } from '../utils/dateRange.js';

// Cache configuration
const DEFAULT_TTL = 300; // 5 minutes in seconds (reports need freshness)
const CHECK_PERIOD = 60; // Check for expired keys every minute

// Initialize cache
const reportCache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: CHECK_PERIOD,
  useClones: true, // Clone report data to prevent mutations
});

// Track cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate cache key from report parameters
 * Uses hash of parameters for consistent key generation
 * @param reportType - Type of report (e.g., 'SALES_REPORT', 'INVENTORY_VALUATION')
 * @param parameters - Report parameters object
 */
function generateKey(reportType: string, parameters: Record<string, unknown>): string {
  // Sort parameters for consistent hash
  const sortedParams = Object.keys(parameters)
    .sort()
    .reduce((acc, key) => {
      acc[key] = parameters[key];
      return acc;
    }, {} as Record<string, unknown>);

  // Generate hash of parameters
  const paramHash = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedParams))
    .digest('hex')
    .substring(0, 16); // First 16 chars for shorter keys

  return `report:${reportType}:${paramHash}`;
}

/**
 * Get cached report
 * Returns null if not found or expired
 * @param reportType - Type of report
 * @param parameters - Report parameters
 */
export function get<T = unknown>(reportType: string, parameters: Record<string, unknown>): T | null {
  const key = generateKey(reportType, parameters);
  const value = reportCache.get<T>(key);

  if (value !== undefined) {
    cacheHits++;
    logger.debug('Report cache hit', { reportType, key });
    return value;
  }

  cacheMisses++;
  logger.debug('Report cache miss', { reportType, key });
  return null;
}

/**
 * Set cached report
 * @param reportType - Type of report
 * @param parameters - Report parameters
 * @param value - Report result data
 * @param ttl - Time to live in seconds (defaults to 5 minutes)
 */
export function set<T = unknown>(
  reportType: string,
  parameters: Record<string, unknown>,
  value: T,
  ttl: number = DEFAULT_TTL
): void {
  const key = generateKey(reportType, parameters);
  reportCache.set(key, value, ttl);

  logger.debug('Report cached', { reportType, key, ttl });
}

/**
 * Invalidate all reports of a specific type
 * Called when underlying data changes (e.g., new sale, inventory update)
 * @param reportType - Type of report to invalidate
 */
export function invalidateType(reportType: string): void {
  const keys = reportCache.keys();
  let deleteCount = 0;

  for (const key of keys) {
    if (key.startsWith(`report:${reportType}:`)) {
      reportCache.del(key);
      deleteCount++;
    }
  }

  logger.info('Report type invalidated', { reportType, deleteCount });
}

/**
 * Invalidate all cached reports
 * Called when major data changes occur (e.g., bulk import, database restore)
 */
export function invalidateAll(): void {
  const keyCount = reportCache.keys().length;
  reportCache.flushAll();

  logger.warn('All reports invalidated', { keyCount });
}

/**
 * Get cache statistics
 * @returns Cache hit rate, key count, and request stats
 */
export function getStats() {
  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    totalRequests,
    hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimals
    keyCount: reportCache.keys().length,
    memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
  };
}

/**
 * Reset cache statistics
 * Used for monitoring periods
 */
export function resetStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  logger.info('Report cache stats reset');
}

/**
 * Common report types (constants for consistency)
 */
export const REPORT_TYPES = {
  SALES: 'SALES_REPORT',
  INVENTORY_VALUATION: 'INVENTORY_VALUATION',
  PROFIT_LOSS: 'PROFIT_LOSS',
  PRODUCT_PERFORMANCE: 'PRODUCT_PERFORMANCE',
  CUSTOMER_STATEMENT: 'CUSTOMER_STATEMENT',
  SUPPLIER_PERFORMANCE: 'SUPPLIER_PERFORMANCE',
  STOCK_MOVEMENT: 'STOCK_MOVEMENT',
  EXPIRY_ALERT: 'EXPIRY_ALERT',
  REORDER_REPORT: 'REORDER_REPORT',
  PAYMENT_SUMMARY: 'PAYMENT_SUMMARY',
} as const;

/**
 * TTL presets for different report types
 * More stable reports can have longer TTL
 */
export const TTL_PRESETS = {
  REALTIME: 60, // 1 minute - for frequently changing data (sales dashboard)
  STANDARD: 300, // 5 minutes - default for most reports
  LONG: 900, // 15 minutes - for stable data (historical reports)
  VERY_LONG: 3600, // 1 hour - for archival reports
} as const;

/**
 * Smart caching: Determine TTL based on report parameters
 * @param reportType - Type of report
 * @param parameters - Report parameters
 * @returns Recommended TTL in seconds
 */
export function getRecommendedTTL(reportType: string, parameters: Record<string, unknown>): number {
  // Real-time reports (today's data)
  const today = getBusinessDate();
  if (parameters.startDate === today || parameters.asOfDate === today) {
    return TTL_PRESETS.REALTIME;
  }

  // Historical reports (past data unlikely to change)
  const endDate = new Date(String(parameters.endDate || parameters.asOfDate || Date.now()));
  const daysOld = Math.floor((Date.now() - endDate.getTime()) / (1000 * 60 * 60 * 24));

  if (daysOld > 30) {
    return TTL_PRESETS.VERY_LONG; // Old data is stable
  } else if (daysOld > 7) {
    return TTL_PRESETS.LONG;
  }

  return TTL_PRESETS.STANDARD; // Default
}

/**
 * Invalidate reports related to specific entities
 * Example: When product updated, invalidate product performance reports
 * @param entityType - Type of entity (product, customer, supplier)
 * @param entityId - Entity UUID
 */
export function invalidateEntity(entityType: string, entityId: string): void {
  const keys = reportCache.keys();
  let deleteCount = 0;

  for (const key of keys) {
    // Check if cached report parameters contain the entity
    const cachedValue = reportCache.get(key);
    if (cachedValue && typeof cachedValue === 'object') {
      const params = (cachedValue as Record<string, unknown>).parameters as Record<string, unknown> || {};
      const entityIdKey = `${entityType}Id`;

      if (params[entityIdKey] === entityId) {
        reportCache.del(key);
        deleteCount++;
      }
    }
  }

  logger.info('Entity reports invalidated', { entityType, entityId, deleteCount });
}

// Export cache instance for testing
export const _cache = reportCache;
