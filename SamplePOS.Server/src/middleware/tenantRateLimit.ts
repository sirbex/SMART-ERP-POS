// Per-Tenant Rate Limiting Middleware
// File: SamplePOS.Server/src/middleware/tenantRateLimit.ts
//
// Applies separate request budgets per tenant, scaled by plan.
// Runs AFTER tenantMiddleware (requires req.tenantId and req.tenant).
// Complements the global IP-based rate limit in security.ts.

import type { Request, Response, NextFunction } from 'express';
import type { TenantPlan } from '../../../shared/types/tenant.js';
import logger from '../utils/logger.js';

// ── Plan-based rate limits (requests per minute) ──────────
const PLAN_RATE_LIMITS: Record<TenantPlan, number> = {
    FREE: 60,
    STARTER: 200,
    PROFESSIONAL: 600,
    ENTERPRISE: 2000,
};
const DEFAULT_LIMIT = 60;
const WINDOW_MS = 60_000; // 1 minute sliding window

interface TenantBucket {
    count: number;
    windowStart: number;
}

// In-memory buckets keyed by tenantId
const buckets = new Map<string, TenantBucket>();

// Periodic cleanup to prevent memory leak from deactivated tenants
const CLEANUP_INTERVAL = 5 * 60_000; // every 5 minutes
const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
        if (now - bucket.windowStart > WINDOW_MS * 2) {
            buckets.delete(key);
        }
    }
}, CLEANUP_INTERVAL);
if (cleanupTimer.unref) cleanupTimer.unref();

/**
 * Tenant-scoped rate limiter.
 * Returns 429 when a tenant exceeds their plan's requests-per-minute budget.
 * Attaches standard RateLimit headers (RFC 6585 / draft-ietf-httpapi-ratelimit).
 */
export function tenantRateLimit(req: Request, res: Response, next: NextFunction): void {
    // Skip if tenant wasn't resolved (health checks, platform routes)
    if (!req.tenantId) return next();

    const plan = (req.tenant?.plan ?? 'FREE') as TenantPlan;
    const limit = PLAN_RATE_LIMITS[plan] ?? DEFAULT_LIMIT;
    const now = Date.now();

    let bucket = buckets.get(req.tenantId);
    if (!bucket || now - bucket.windowStart >= WINDOW_MS) {
        bucket = { count: 0, windowStart: now };
        buckets.set(req.tenantId, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, limit - bucket.count);
    const resetSec = Math.ceil((bucket.windowStart + WINDOW_MS - now) / 1000);

    // Always set informational headers
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(resetSec));

    if (bucket.count > limit) {
        logger.warn('Tenant rate limit exceeded', {
            tenantId: req.tenantId,
            slug: req.tenant?.slug,
            plan,
            limit,
            count: bucket.count,
        });

        res.status(429).json({
            success: false,
            error: `Rate limit exceeded for plan ${plan}. Limit: ${limit} requests/minute.`,
        });
        return;
    }

    next();
}
