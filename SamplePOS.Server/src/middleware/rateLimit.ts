import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redisClient from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Create Redis store for distributed rate limiting
 * Falls back to memory store if Redis unavailable
 */
function createStore() {
  try {
    if (redisClient.isOpen) {
      return new RedisStore({
        sendCommand: (...args: string[]) => redisClient.sendCommand(args),
        prefix: 'pos:ratelimit:',
      });
    }
  } catch (error) {
    logger.warn('Rate limiting falling back to memory store (Redis unavailable)');
  }
  return undefined; // Uses default memory store
}

// General API limiter: 100 requests per 15 minutes per IP
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore(),
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path.startsWith('/health');
  },
});

// Auth-specific limiter: 5 requests per 15 minutes per IP (strict)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Stricter limit for auth endpoints
  standardHeaders: true,
  legacyHeaders: false,
  store: createStore(),
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  skipSuccessfulRequests: true, // Only count failed attempts
});

export default apiLimiter;
