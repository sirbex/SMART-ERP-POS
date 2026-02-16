// Multi-Tenant Resolution Middleware
// File: SamplePOS.Server/src/middleware/tenantMiddleware.ts
//
// Resolves the current tenant from:
//   1. JWT claim (tenantId in token payload)
//   2. X-Tenant-ID header (for edge nodes with API key auth)
//   3. Subdomain (e.g., acme-shop.smart-erp.com)
//   4. Falls back to 'default' tenant for backward compatibility
//
// Attaches req.tenantPool (pg.Pool) and req.tenant (Tenant metadata)

import type { Request, Response, NextFunction } from 'express';
import type pg from 'pg';
import { connectionManager, type TenantPoolConfig } from '../db/connectionManager.js';
import type { Tenant, TenantDbRow } from '../../../shared/types/tenant.js';
import { normalizeTenant } from '../../../shared/types/tenant.js';
import logger from '../utils/logger.js';
import NodeCache from 'node-cache';

// Cache tenant metadata for 5 minutes to avoid DB lookups on every request
const tenantCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

// Extend Express Request to include tenant context
declare global {
  namespace Express {
    interface Request {
      tenantPool?: pg.Pool;
      tenant?: Tenant;
      tenantId?: string;
    }
  }
}

/**
 * Resolve tenant from request and attach pool + metadata.
 * 
 * Resolution order:
 * 1. req.user.tenantId (set by auth middleware from JWT)
 * 2. X-Tenant-ID header (edge nodes / API clients)
 * 3. Subdomain (acme-shop.smart-erp.com → slug = 'acme-shop')
 * 4. Default tenant ('default' — backward compat for single-tenant mode)
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
  let tenantId: string | undefined;

  // 1. From JWT (set by auth middleware — preferred for authenticated requests)
  const userWithTenant = req.user as { id: string; tenantId?: string; tenantSlug?: string } | undefined;
  if (userWithTenant?.tenantId) {
    tenantId = userWithTenant.tenantId;
  }

  // 2. From X-Tenant-ID header (for API key auth / edge nodes)
  if (!tenantId && !tenantSlug) {
    const headerTenantId = req.headers['x-tenant-id'] as string | undefined;
    if (headerTenantId) {
      // Could be UUID or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(headerTenantId);
      if (isUuid) {
        tenantId = headerTenantId;
      } else {
        tenantSlug = headerTenantId;
      }
    }
  }

  // 3. From subdomain
  if (!tenantId && !tenantSlug) {
    const host = req.hostname || req.headers.host || '';
    const subdomain = extractSubdomain(host);
    if (subdomain && subdomain !== 'www' && subdomain !== 'api') {
      tenantSlug = subdomain;
    }
  }

  // 4. Default fallback (single-tenant / local development)
  if (!tenantId && !tenantSlug) {
    tenantSlug = 'default';
  }

  // Look up tenant metadata
  const tenant = tenantId
    ? await getTenantById(tenantId)
    : await getTenantBySlug(tenantSlug!);

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
 * Get tenant pool from request — convenience helper for controllers/services
 * Falls back to the global pool (backward compatibility)
 */
export function getTenantPool(req: Request): pg.Pool {
  if (req.tenantPool) return req.tenantPool;

  // Fallback: use the pool from app settings (single-tenant mode)
  const appPool = req.app.get('pool');
  if (appPool) return appPool;

  throw new Error('No database pool available on request');
}
