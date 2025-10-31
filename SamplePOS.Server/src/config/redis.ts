/**
 * Redis Configuration and Client Setup
 * 
 * Features:
 * - Connection pooling and retry strategy
 * - Health checks and graceful reconnection
 * - Type-safe key prefixing
 * - Performance monitoring
 */

import { createClient } from 'redis';
import logger from '../utils/logger.js';

// Redis configuration from environment
const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;
const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

// Key prefixes for different data types
export const REDIS_PREFIXES = {
  PRODUCT: 'pos:product:',
  CUSTOMER: 'pos:customer:',
  SALE: 'pos:sale:',
  USER: 'pos:user:',
  SESSION: 'pos:session:',
  CACHE: 'pos:cache:',
  RATE_LIMIT: 'pos:ratelimit:',
} as const;

// TTL configurations (in seconds)
export const REDIS_TTL = {
  SHORT: 60,        // 1 minute
  MEDIUM: 300,      // 5 minutes
  LONG: 1800,       // 30 minutes
  SESSION: 86400,   // 24 hours
} as const;

// Create Redis client
export const redisClient = createClient({
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis: Max reconnection attempts reached');
        return new Error('Redis connection failed after 10 retries');
      }
      const delay = Math.min(retries * 100, 3000);
      logger.warn(`Redis: Reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
  },
  password: REDIS_PASSWORD,
  database: REDIS_DB,
});

// Redis event handlers
redisClient.on('connect', () => {
  logger.info('✅ Redis client connecting...');
});

redisClient.on('ready', () => {
  logger.info('✅ Redis client ready');
});

redisClient.on('error', (err) => {
  logger.error('❌ Redis client error:', err);
});

redisClient.on('reconnecting', () => {
  logger.warn('⚠️  Redis client reconnecting...');
});

redisClient.on('end', () => {
  logger.warn('⚠️  Redis client connection closed');
});

/**
 * Connect to Redis with error handling
 */
export async function connectRedis(): Promise<void> {
  try {
    if (!redisClient.isOpen) {
      await redisClient.connect();
      logger.info('✅ Redis connected successfully');
    }
  } catch (error) {
    logger.error('❌ Failed to connect to Redis:', error);
    // Don't throw - allow app to start without Redis (degraded mode)
    logger.warn('⚠️  Application starting without Redis cache');
  }
}

/**
 * Disconnect from Redis gracefully
 */
export async function disconnectRedis(): Promise<void> {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('✅ Redis disconnected gracefully');
    }
  } catch (error) {
    logger.error('❌ Error disconnecting from Redis:', error);
  }
}

/**
 * Check Redis health status
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!redisClient.isOpen) {
      return false;
    }
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
}

/**
 * Get Redis stats for monitoring
 */
export async function getRedisStats(): Promise<{
  connected: boolean;
  keys?: number;
  memory?: string;
  uptime?: number;
}> {
  try {
    if (!redisClient.isOpen) {
      return { connected: false };
    }

    const info = await redisClient.info('stats');
    const dbSize = await redisClient.dbSize();
    
    return {
      connected: true,
      keys: dbSize,
      memory: info.match(/used_memory_human:(.+)/)?.[1]?.trim(),
      uptime: parseInt(info.match(/uptime_in_seconds:(.+)/)?.[1] || '0', 10),
    };
  } catch (error) {
    logger.error('Failed to get Redis stats:', error);
    return { connected: false };
  }
}

export default redisClient;
