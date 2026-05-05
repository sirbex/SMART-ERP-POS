/**
 * Idempotency Middleware
 *
 * Prevents duplicate transaction submissions caused by network retries,
 * double-clicks, or browser back/forward navigation.
 *
 * HOW IT WORKS:
 *   1. Client generates a UUID and sends it as `X-Idempotency-Key: <uuid>`
 *   2. On first receipt, request proceeds normally; response is cached in DB
 *   3. On any retry with the same key (within 24h), the cached response is
 *      returned immediately — the business logic is NOT re-executed
 *
 * APPLIED TO: POST, PUT, PATCH, DELETE requests that include the header
 * SKIPPED:    GET/HEAD, requests without the header (opt-in per client)
 *
 * REQUIRES: idempotency_keys table (migration 071_idempotency_keys.sql)
 */

import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import logger from '../utils/logger.js';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function idempotencyMiddleware(globalPool: Pool) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Only apply to mutating methods
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    const idempotencyKey = req.headers['x-idempotency-key'];
    // Skip if no key provided (opt-in — non-idempotent clients are unaffected)
    if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) {
      next();
      return;
    }

    // Use tenant-specific pool when available (resolved by tenantMiddleware)
    const pool: Pool = req.tenantPool ?? globalPool;
    const userId = req.user?.id ?? null;

    let tableExists = true;
    try {
      // Check for a previously cached successful response
      const existing = await pool.query<{
        status_code: number;
        response_body: Record<string, unknown>;
      }>(
        `SELECT status_code, response_body
         FROM idempotency_keys
         WHERE key = $1
           AND expires_at > NOW()
           AND status_code IS NOT NULL`,
        [idempotencyKey]
      );

      if (existing.rows[0]) {
        // Replay the cached response — business logic NOT re-executed
        logger.debug('Idempotency key hit — replaying cached response', {
          key: idempotencyKey,
          statusCode: existing.rows[0].status_code,
          path: req.path,
        });
        res.status(existing.rows[0].status_code).json(existing.rows[0].response_body);
        return;
      }
    } catch (err) {
      // Table may not exist yet (migration pending) — proceed without dedup rather than blocking
      logger.warn('Idempotency key lookup failed (proceeding without dedup)', {
        key: idempotencyKey,
        path: req.path,
        error: err instanceof Error ? err.message : String(err),
      });
      tableExists = false;
      next();
      return;
    }

    if (!tableExists) {
      next();
      return;
    }

    // Wrap res.json to intercept the outgoing response and cache it
    const originalJson = res.json.bind(res) as (body: unknown) => Response;
    (res as Response).json = function (body: unknown): Response {
      const statusCode = res.statusCode;
      // Only cache successful (2xx) responses
      if (statusCode >= 200 && statusCode < 300) {
        pool
          .query(
            `INSERT INTO idempotency_keys
               (key, user_id, method, path, status_code, response_body)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (key) DO UPDATE
               SET status_code    = EXCLUDED.status_code,
                   response_body  = EXCLUDED.response_body`,
            [idempotencyKey, userId, req.method, req.path, statusCode, JSON.stringify(body)]
          )
          .catch((err: unknown) => {
            logger.error('Failed to store idempotency key (non-fatal)', {
              key: idempotencyKey,
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }
      return originalJson(body);
    };

    next();
  };
}
