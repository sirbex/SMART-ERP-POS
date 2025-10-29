/**
 * Cache Configuration
 * 
 * Uses node-cache for in-memory caching
 * Can be easily upgraded to Redis when needed
 */

import NodeCache from 'node-cache';
import logger from '../utils/logger.js';

/**
 * Cache instance with default TTL of 5 minutes
 * stdTTL: Standard time to live in seconds
 * checkperiod: Automatic delete check interval in seconds
 */
const cache = new NodeCache({
  stdTTL: 300, // 5 minutes default
  checkperiod: 60, // Check for expired keys every 60 seconds
  useClones: false, // Better performance, but be careful with object mutations
});

// Log cache statistics every 5 minutes
setInterval(() => {
  const stats = cache.getStats();
  logger.info('Cache statistics', {
    keys: stats.keys,
    hits: stats.hits,
    misses: stats.misses,
    hitRate: stats.hits > 0 ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(2) + '%' : '0%'
  });
}, 300000);

// Handle cache errors
cache.on('error', (error) => {
  logger.error('Cache error', { error: error.message });
});

export default cache;
