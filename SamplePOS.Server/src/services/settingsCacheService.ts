// Settings Cache Service - In-Memory Settings Caching
// Purpose: Cache frequently accessed system settings to reduce database queries
// Uses NodeCache for sub-millisecond lookups

import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

// Cache configuration
const DEFAULT_TTL = 600; // 10 minutes in seconds (settings change infrequently)
const CHECK_PERIOD = 120; // Check for expired keys every 2 minutes

// Initialize cache
const settingsCache = new NodeCache({
  stdTTL: DEFAULT_TTL,
  checkperiod: CHECK_PERIOD,
  useClones: true, // Clone settings objects to prevent mutations
});

// Track cache statistics
let cacheHits = 0;
let cacheMisses = 0;

/**
 * Generate cache key for settings
 * @param settingKey - Setting identifier (e.g., 'system_settings', 'invoice_settings')
 * @param subKey - Optional sub-key for specific setting
 */
function generateKey(settingKey: string, subKey?: string): string {
  return subKey ? `settings:${settingKey}:${subKey}` : `settings:${settingKey}`;
}

/**
 * Get cached setting
 * Returns null if not found
 * @param settingKey - Setting identifier
 * @param subKey - Optional sub-key
 */
export function get<T = any>(settingKey: string, subKey?: string): T | null {
  const key = generateKey(settingKey, subKey);
  const value = settingsCache.get<T>(key);

  if (value !== undefined) {
    cacheHits++;
    logger.debug('Settings cache hit', { key });
    return value;
  }

  cacheMisses++;
  logger.debug('Settings cache miss', { key });
  return null;
}

/**
 * Set cached setting
 * @param settingKey - Setting identifier
 * @param value - Setting value
 * @param subKey - Optional sub-key
 * @param ttl - Time to live in seconds (defaults to 10 minutes)
 */
export function set<T = any>(
  settingKey: string,
  value: T,
  subKey?: string,
  ttl: number = DEFAULT_TTL
): void {
  const key = generateKey(settingKey, subKey);
  settingsCache.set(key, value, ttl);

  logger.debug('Setting cached', { key, ttl });
}

/**
 * Invalidate specific setting
 * Called when setting is updated
 * @param settingKey - Setting identifier
 * @param subKey - Optional sub-key
 */
export function invalidate(settingKey: string, subKey?: string): void {
  const key = generateKey(settingKey, subKey);
  const deleted = settingsCache.del(key);

  logger.info('Setting invalidated', { key, deleted });
}

/**
 * Invalidate all settings with specific prefix
 * Example: invalidatePrefix('invoice_settings') invalidates all invoice settings
 * @param prefix - Setting key prefix
 */
export function invalidatePrefix(prefix: string): void {
  const keys = settingsCache.keys();
  let deleteCount = 0;

  for (const key of keys) {
    if (key.startsWith(`settings:${prefix}:`)) {
      settingsCache.del(key);
      deleteCount++;
    }
  }

  logger.info('Settings prefix invalidated', { prefix, deleteCount });
}

/**
 * Invalidate all cached settings
 * Use when system-wide settings change (e.g., migration, reset)
 */
export function invalidateAll(): void {
  const keyCount = settingsCache.keys().length;
  settingsCache.flushAll();

  logger.warn('All settings invalidated', { keyCount });
}

/**
 * Get cache statistics
 * @returns Cache hit rate and key count
 */
export function getStats() {
  const totalRequests = cacheHits + cacheMisses;
  const hitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    totalRequests,
    hitRate: Math.round(hitRate * 100) / 100, // Round to 2 decimals
    keyCount: settingsCache.keys().length,
  };
}

/**
 * Reset cache statistics
 * Used for monitoring periods
 */
export function resetStats(): void {
  cacheHits = 0;
  cacheMisses = 0;
  logger.info('Settings cache stats reset');
}

/**
 * Common setting keys (constants for consistency)
 */
export const SETTING_KEYS = {
  SYSTEM: 'system_settings',
  INVOICE: 'invoice_settings',
  TAX: 'tax_settings',
  CURRENCY: 'currency_settings',
  NOTIFICATION: 'notification_settings',
  BACKUP: 'backup_settings',
  SECURITY: 'security_settings',
} as const;

/**
 * Pre-warm cache with frequently accessed settings
 * Call on server startup for optimal performance
 * @param settingsData - Object with setting key-value pairs
 */
export function preWarm(settingsData: Record<string, any>): void {
  let count = 0;

  for (const [key, value] of Object.entries(settingsData)) {
    set(key, value);
    count++;
  }

  logger.info('Settings cache pre-warmed', { count });
}

// Export cache instance for testing
export const _cache = settingsCache;
