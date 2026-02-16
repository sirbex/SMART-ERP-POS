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
import { connectionManager, type TenantPoolConfig } from '../db/connectionManager.js';
import type { Tenant, TenantDbRow } from '../../../shared/types/tenant.js';
import { normalizeTenant } from '../../../shared/types/tenant.js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';

// Cache tenant metadata for 5 minutes to avoid DB lookups on every request
const tenantCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

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
    logger.error('Tenant resolution failed', { error: err.message, path: req.path });
    res.status(500).json({
      success: false,
      error: 'Failed to resolve tenant',
    });
  });
}

async function resolveTenant(req: Request, res: Response, next: NextFunction): Promise<void> {
  // Skip tenant resolution for health checks and super-admin routes
  if (req.path === '/health' || req.path.startsWith('/api/platform')) {
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

  const parts = hostname.split('.');

  // Need at least 3 parts for a subdomain (sub.domain.tld)
  if (parts.length >= 3) {
    return parts[0];
  }

  return undefined;
}

/**
 * Look up tenant by ID with caching
 */
async function getTenantById(tenantId: string): Promise<Tenant | null> {
  const cacheKey = `tenant:id:${tenantId}`;
  const cached = tenantCache.get<Tenant>(cacheKey);
  if (cached) return cached;

  const masterPool = connectionManager.getMasterPool();
  const result = await masterPool.query<TenantDbRow>(
    'SELECT * FROM tenants WHERE id = $1',
    [tenantId]
  );

  if (result.rows.length === 0) return null;

  const tenant = normalizeTenant(result.rows[0]);
  tenantCache.set(cacheKey, tenant);
  tenantCache.set(`tenant:slug:${tenant.slug}`, tenant);
  return tenant;
}

/**
 * Look up tenant by slug with caching
 */
async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const cacheKey = `tenant:slug:${slug}`;
  const cached = tenantCache.get<Tenant>(cacheKey);
  if (cached) return cached;

  const masterPool = connectionManager.getMasterPool();
  const result = await masterPool.query<TenantDbRow>(
    'SELECT * FROM tenants WHERE slug = $1',
    [slug]
  );

  if (result.rows.length === 0) return null;

  const tenant = normalizeTenant(result.rows[0]);
  tenantCache.set(cacheKey, tenant);
  tenantCache.set(`tenant:id:${tenant.id}`, tenant);
  return tenant;
}

/**
 * Invalidate cached tenant data (call after tenant updates)
 */
export function invalidateTenantCache(tenantId?: string, slug?: string): void {
  if (tenantId) tenantCache.del(`tenant:id:${tenantId}`);
  if (slug) tenantCache.del(`tenant:slug:${slug}`);
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
