// Multi-Tenant Resolution Middleware
// File: SamplePOS.Server/src/middleware/tenantMiddleware.ts
//
// SECURITY MODEL:
// - This middleware runs BEFORE per-route authenticate().
// - It resolves tenant from subdomain or 'default' fallback ONLY.
// - The X-Tenant-ID header is ONLY accepted from authenticated requests
//   (post-auth cross-validation in verifyTenantAccess middleware).
// - req.tenantPool is attached so that authenticate() can query the
//   correct tenant database for user lookup.
//
// CROSS-TENANT PROTECTION:
// - JWT tokens contain tenantId; after auth, verifyTenantAccess()
//   confirms the JWT tenant matches the resolved tenant.
// - X-Tenant-ID header is ignored during initial resolution to prevent
//   unauthenticated header forgery attacks.

import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';
import {
  connectionManager,
  TenantUnavailableError,
  type TenantPoolConfig,
} from '../db/connectionManager.js';
import type { Tenant, TenantDbRow } from '../../../shared/types/tenant.js';
import { normalizeTenant } from '../../../shared/types/tenant.js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';
import { distributedCache } from '../services/distributedCache.js';
import type { TenantPlan } from '../../../shared/types/tenant.js';

// L1: in-process cache (5 min) — zero-latency for hot tenants
const tenantCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// L2 Redis TTL — longer because Redis survives restarts & is shared across instances
const REDIS_TENANT_TTL = 900; // 15 minutes

// Note: Express Request type extensions (tenantPool, tenant, tenantId)
// are declared in src/types/express.d.ts — do NOT duplicate here.

/**
 * Resolve tenant from request and attach pool + metadata.
 *
 * SAFE resolution order (no unauthenticated header trust):
 * 1. Subdomain (acme-shop.smart-erp.com → slug = 'acme-shop')
 * 2. Default tenant ('default' — backward compat for single-tenant mode)
 *
 * X-Tenant-ID header and JWT tenantId are ONLY used in the
 * post-authentication verifyTenantAccess() middleware.
 */
export function tenantMiddleware(req: Request, res: Response, next: NextFunction): void {
  resolveTenant(req, res, next).catch((err) => {
    // Circuit breaker: tenant DB is known to be down → 503
    if (err instanceof TenantUnavailableError) {
      res.status(503).set('Retry-After', String(err.retryAfterSec)).json({
        success: false,
        error: err.message,
      });
      return;
    }

    logger.error('Tenant resolution failed', { error: err.message, path: req.path });
    res.status(500).json({
      success: false,
      error: 'Failed to resolve tenant',
    });
  });
}

async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip tenant resolution for health checks and super-admin routes
  if (
    req.path === '/health' ||
    req.path.startsWith('/api/health') ||
    req.path.startsWith('/api/platform')
  ) {
    return next();
  }

  let tenantSlug: string | undefined;

  // 1. From subdomain (safe — derived from DNS, not user-controlled headers)
  const host = req.hostname || req.headers.host || '';
  const subdomain = extractSubdomain(host);
  if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
    tenantSlug = subdomain;
  }

  // 2. Default fallback (single-tenant / local development)
  if (!tenantSlug) {
    tenantSlug = 'default';
  }

  // Look up tenant metadata
  const tenant = await getTenantBySlug(tenantSlug);

  if (!tenant) {
    res.status(404).json({
      success: false,
      error: 'Tenant not found',
    });
    return;
  }

  if (tenant.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      error: `Tenant is ${tenant.status.toLowerCase()}. Contact support.`,
    });
    return;
  }

  // Get or create the connection pool for this tenant
  const poolConfig: TenantPoolConfig = {
    tenantId: tenant.id,
    slug: tenant.slug,
    databaseName: tenant.databaseName,
    databaseHost: tenant.databaseHost,
    databasePort: tenant.databasePort,
    plan: tenant.plan as TenantPlan,
  };

  req.tenantPool = connectionManager.getPool(poolConfig);
  req.tenant = tenant;
  req.tenantId = tenant.id;

  next();
}

/**
 * POST-AUTHENTICATION middleware: verifies the authenticated user
 * belongs to the resolved tenant. Must be applied AFTER authenticate().
 *
 * For edge nodes using API key auth with X-Tenant-ID header,
 * this middleware re-resolves the tenant from the header and
 * cross-validates against the JWT tenantId.
 *
 * Usage in routes:
 *   router.post('/upload', authenticate, verifyTenantAccess, handler);
 */
export function verifyTenantAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ success: false, error: 'Authentication required for tenant access' });
    return;
  }

  // If JWT contains tenantId, enforce it matches the resolved tenant
  const jwtTenantId = req.user.tenantId;
  if (jwtTenantId && req.tenantId && jwtTenantId !== req.tenantId) {
    logger.warn('Tenant access denied: JWT tenantId does not match resolved tenant', {
      jwtTenantId,
      resolvedTenantId: req.tenantId,
      userId: req.user.id,
      path: req.path,
    });
    res.status(403).json({
      success: false,
      error: 'Access denied: tenant mismatch',
    });
    return;
  }

  next();
}

/**
 * Extract subdomain from hostname
 * Examples:
 *   'acme-shop.smart-erp.com' → 'acme-shop'
 *   'localhost' → undefined
 *   'smart-erp.com' → undefined
 */
function extractSubdomain(host: string): string | undefined {
  // Remove port
  const hostname = host.split(':')[0];

  // Localhost — no subdomain
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return undefined;
  }

  // IP addresses — no subdomain (e.g. 209.38.203.138)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return undefined;
  }

  const parts = hostname.split('.');

  // Need at least 3 parts for a subdomain (sub.domain.tld)
  if (parts.length >= 3) {
    return parts[0];
  }

  return undefined;
}

/**
 * Look up tenant by ID — L1 (NodeCache) → L2 (Redis) → master DB
 */
async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `tenant:id:${tenantId}`;

  // L1: in-process
  const cached = tenantCache.get<Tenant>(cacheKey);
  if (cached) return cached;

  // L2: Redis (shared across instances, survives restarts)
  const redisTenant = await distributedCache.get<Tenant>(cacheKey);
  if (redisTenant) {
    tenantCache.set(cacheKey, redisTenant);
    tenantCache.set(`tenant:slug:${redisTenant.slug}`, redisTenant);
    return redisTenant;
  }

  // L3: master DB
  const masterPool = connectionManager.getMasterPool();
  const result = await masterPool.query<TenantDbRow>('SELECT * FROM tenants WHERE id = $1', [
    tenantId,
  ]);

  if (result.rows.length === 0) return null;

  const tenant = normalizeTenant(result.rows[0]);
  tenantCache.set(cacheKey, tenant);
  tenantCache.set(`tenant:slug:${tenant.slug}`, tenant);
  distributedCache.set(cacheKey, tenant, { ttl: REDIS_TENANT_TTL }).catch(() => { });
  distributedCache
    .set(`tenant:slug:${tenant.slug}`, tenant, { ttl: REDIS_TENANT_TTL })
    .catch(() => { });
  return tenant;
}

/**
 * Look up tenant by slug — L1 (NodeCache) → L2 (Redis) → master DB
 */
async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const cacheKey = `tenant:slug:${slug}`;

  // L1: in-process
  const cached = tenantCache.get<Tenant>(cacheKey);
  if (cached) return cached;

  // L2: Redis
  const redisTenant = await distributedCache.get<Tenant>(cacheKey);
  if (redisTenant) {
    tenantCache.set(cacheKey, redisTenant);
    tenantCache.set(`tenant:id:${redisTenant.id}`, redisTenant);
    return redisTenant;
  }

  // L3: master DB
  const masterPool = connectionManager.getMasterPool();
  const result = await masterPool.query<TenantDbRow>('SELECT * FROM tenants WHERE slug = $1', [
    slug,
  ]);

  if (result.rows.length === 0) return null;

  const tenant = normalizeTenant(result.rows[0]);
  tenantCache.set(cacheKey, tenant);
  tenantCache.set(`tenant:id:${tenant.id}`, tenant);
  distributedCache.set(cacheKey, tenant, { ttl: REDIS_TENANT_TTL }).catch(() => { });
  distributedCache.set(`tenant:id:${tenant.id}`, tenant, { ttl: REDIS_TENANT_TTL }).catch(() => { });
  return tenant;
}

/**
 * Invalidate cached tenant data — both L1 (NodeCache) and L2 (Redis).
 * Call after tenant updates (status change, DB migration, etc.).
 */
export function invalidateTenantCache(tenantId?: string, slug?: string): void {
  if (tenantId) {
    tenantCache.del(`tenant:id:${tenantId}`);
    distributedCache.delete(`tenant:id:${tenantId}`).catch(() => { });
  }
  if (slug) {
    tenantCache.del(`tenant:slug:${slug}`);
    distributedCache.delete(`tenant:slug:${slug}`).catch(() => { });
  }
}

/**
 * Get the tenant-scoped database pool from the request.
 *
 * SECURITY: This function does NOT fall back to a global pool.
 * If no tenant pool is available, it throws — failing safe
 * rather than silently querying the wrong database.
 */
export function getTenantPool(req: Request): pg.Pool {
  if (req.tenantPool) return req.tenantPool;

  throw new Error(
    'No tenant database pool on request. Ensure tenantMiddleware is applied and tenant resolution succeeded.'
  );
}

/**
 * Get the read-replica pool for a tenant (falls back to primary if no replica).
 * Use for read-heavy workloads: reports, dashboards, search queries.
 */
export function getTenantReadPool(req: Request): pg.Pool {
  if (req.tenantId) {
    const readPool = connectionManager.getReadPool(req.tenantId);
    if (readPool) return readPool;
  }
  return getTenantPool(req);
}
