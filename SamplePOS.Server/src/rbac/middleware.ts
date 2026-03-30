import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { RbacService, RbacError } from './service.js';
import type { AuthorizationContext } from './types.js';
import logger from '../utils/logger.js';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthorizationContext;
      rbacService?: RbacService;
    }
  }
}

// Fallback pool for single-tenant mode (set during initialization)
let fallbackPool: Pool | null = null;

// Per-tenant RbacService cache (keyed by pool reference)
const serviceCache = new WeakMap<Pool, RbacService>();

/**
 * Initialize RBAC with a fallback pool for single-tenant / default mode.
 * In multi-tenant mode, req.tenantPool takes precedence.
 */
export function initializeRbacMiddleware(pool: Pool): void {
  fallbackPool = pool;
}

/**
 * Get or create an RbacService for the given pool.
 * Uses WeakMap so services are garbage-collected when pools are evicted.
 */
function getOrCreateService(pool: Pool): RbacService {
  let service = serviceCache.get(pool);
  if (!service) {
    service = new RbacService(pool);
    serviceCache.set(pool, service);
  }
  return service;
}

/**
 * Resolve the correct RbacService for the current request.
 * Prefers req.tenantPool (multi-tenant), falls back to global pool (single-tenant).
 */
function resolveRbacService(req: Request): RbacService | null {
  const pool = req.tenantPool || fallbackPool;
  if (!pool) return null;
  return getOrCreateService(pool);
}

export function getRbacService(req?: Request): RbacService {
  if (req) {
    const service = resolveRbacService(req);
    if (service) return service;
  }
  if (fallbackPool) return getOrCreateService(fallbackPool);
  throw new Error('RBAC middleware not initialized. Call initializeRbacMiddleware first.');
}

export function attachRbacService(req: Request, res: Response, next: NextFunction): void {
  const service = resolveRbacService(req);
  if (!service) {
    res.status(500).json({
      success: false,
      error: 'Authorization service not available',
    });
    return;
  }
  req.rbacService = service;
  next();
}

export async function loadAuthorizationContext(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.id) {
    next();
    return;
  }

  const service = resolveRbacService(req);
  if (!service) {
    // If RBAC tables don't exist yet, skip gracefully (allow legacy authorize() fallback)
    logger.debug('RBAC service not available, skipping authorization context');
    next();
    return;
  }

  try {
    req.authContext = await service.buildAuthorizationContext(req.user.id);
    next();
  } catch (error) {
    // If RBAC tables don't exist, skip gracefully rather than blocking all routes
    logger.warn('Failed to load authorization context (RBAC tables may not exist yet)', {
      error: (error as Error).message,
    });
    next();
  }
}

interface RequirePermissionOptions {
  scopeType?: 'global' | 'organization' | 'branch' | 'warehouse';
  scopeIdParam?: string;
  scopeIdBody?: string;
  scopeIdQuery?: string;
}

/**
 * Legacy role → permission mapping for backward compatibility.
 * Used when users have no RBAC role assignments (transition period).
 * Maps the legacy users.role column to permission patterns.
 */
const LEGACY_ROLE_PERMISSIONS: Record<string, (key: string) => boolean> = {
  ADMIN: () => true, // ADMIN has all permissions
  MANAGER: (key) => {
    const module = key.split('.')[0];
    return [
      'sales',
      'inventory',
      'purchasing',
      'customers',
      'suppliers',
      'reports',
      'pos',
      'accounting',
      'banking',
      'delivery',
      'settings',
      'hr',
    ].includes(module);
  },
  CASHIER: (key) => {
    return [
      'pos.read',
      'pos.create',
      'sales.read',
      'sales.create',
      'customers.read',
      'customers.create',
      'inventory.read',
      'suppliers.read',
      'delivery.read',
      'settings.read',
    ].includes(key);
  },
  STAFF: (key) => key.endsWith('.read'),
};

/**
 * Check if a legacy role (from users.role column) grants the given permission.
 * Used during the transition period before all users have RBAC role assignments.
 */
function legacyRoleGrantsPermission(role: string | undefined, permissionKey: string): boolean {
  if (!role) return false;
  const checker = LEGACY_ROLE_PERMISSIONS[role.toUpperCase()];
  return checker ? checker(permissionKey) : false;
}

export function requirePermission(permissionKey: string, options?: RequirePermissionOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const service = resolveRbacService(req);
    if (!service) {
      // Fallback: if RBAC isn't available, use legacy role check
      if (legacyRoleGrantsPermission(req.user.role, permissionKey)) {
        next();
        return;
      }
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
      });
      return;
    }

    const scopeType: string | null = options?.scopeType || null;
    let scopeId: string | null = null;

    if (options?.scopeIdParam && req.params[options.scopeIdParam]) {
      scopeId = req.params[options.scopeIdParam];
    } else if (options?.scopeIdBody && req.body[options.scopeIdBody]) {
      scopeId = req.body[options.scopeIdBody];
    } else if (options?.scopeIdQuery && req.query[options.scopeIdQuery]) {
      scopeId = req.query[options.scopeIdQuery] as string;
    }

    try {
      const hasPermission = await service.checkPermission(
        req.user.id,
        permissionKey,
        scopeType,
        scopeId
      );

      if (hasPermission) {
        next();
        return;
      }

      // RBAC denied — check if user has ANY RBAC roles assigned.
      // If they don't, fall back to legacy role checking (transition period).
      if (legacyRoleGrantsPermission(req.user.role, permissionKey)) {
        logger.debug(
          `RBAC: no RBAC roles for user=${req.user.id}, legacy role ${req.user.role} grants ${permissionKey}`
        );
        next();
        return;
      }

      // Truly denied
      const ipAddress = req.ip || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      await service
        .logPermissionDenied(
          req.user.id,
          permissionKey,
          ipAddress ?? undefined,
          userAgent ?? undefined
        )
        .catch(() => { }); // Don't fail the request if audit logging fails

      logger.debug(
        `RBAC DENIED: user=${req.user.id} permission=${permissionKey} role=${req.user.role}`
      );
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
      });
    } catch (error) {
      // If RBAC tables don't exist yet, fall back to legacy role check
      const errMsg = (error as Error).message || '';
      if (errMsg.includes('does not exist') || errMsg.includes('relation')) {
        logger.warn('RBAC tables not found, falling back to role check');
        if (legacyRoleGrantsPermission(req.user.role, permissionKey)) {
          next();
          return;
        }
      }
      logger.error('RBAC permission check failed', { error: errMsg, permissionKey });
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
}

export function requireAnyPermission(permissionKeys: string[], options?: RequirePermissionOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const service = resolveRbacService(req);
    if (!service) {
      // Legacy fallback
      if (permissionKeys.some((key) => legacyRoleGrantsPermission(req.user!.role, key))) {
        next();
        return;
      }
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
      });
      return;
    }

    const scopeType: string | null = options?.scopeType || null;
    let scopeId: string | null = null;

    if (options?.scopeIdParam && req.params[options.scopeIdParam]) {
      scopeId = req.params[options.scopeIdParam];
    } else if (options?.scopeIdBody && req.body[options.scopeIdBody]) {
      scopeId = req.body[options.scopeIdBody];
    } else if (options?.scopeIdQuery && req.query[options.scopeIdQuery]) {
      scopeId = req.query[options.scopeIdQuery] as string;
    }

    try {
      for (const permissionKey of permissionKeys) {
        const hasPermission = await service.checkPermission(
          req.user.id,
          permissionKey,
          scopeType,
          scopeId
        );

        if (hasPermission) {
          next();
          return;
        }
      }

      // RBAC denied — legacy fallback for users without RBAC roles
      if (permissionKeys.some((key) => legacyRoleGrantsPermission(req.user!.role, key))) {
        next();
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      await service
        .logPermissionDenied(
          req.user.id,
          permissionKeys.join(','),
          ipAddress ?? undefined,
          userAgent ?? undefined
        )
        .catch(() => { });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
      });
    } catch (error) {
      const errMsg = (error as Error).message || '';
      if (
        errMsg.includes('does not exist') &&
        permissionKeys.some((key) => legacyRoleGrantsPermission(req.user!.role, key))
      ) {
        next();
        return;
      }
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
}

export function requireAllPermissions(
  permissionKeys: string[],
  options?: RequirePermissionOptions
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    const service = resolveRbacService(req);
    if (!service) {
      // Legacy fallback - all permissions must be granted by legacy role
      if (permissionKeys.every((key) => legacyRoleGrantsPermission(req.user!.role, key))) {
        next();
        return;
      }
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
      });
      return;
    }

    const scopeType: string | null = options?.scopeType || null;
    let scopeId: string | null = null;

    if (options?.scopeIdParam && req.params[options.scopeIdParam]) {
      scopeId = req.params[options.scopeIdParam];
    } else if (options?.scopeIdBody && req.body[options.scopeIdBody]) {
      scopeId = req.body[options.scopeIdBody];
    } else if (options?.scopeIdQuery && req.query[options.scopeIdQuery]) {
      scopeId = req.query[options.scopeIdQuery] as string;
    }

    try {
      for (const permissionKey of permissionKeys) {
        const hasPermission = await service.checkPermission(
          req.user.id,
          permissionKey,
          scopeType,
          scopeId
        );

        if (!hasPermission) {
          // Legacy fallback — check if all perms granted by legacy role
          if (permissionKeys.every((key) => legacyRoleGrantsPermission(req.user!.role, key))) {
            next();
            return;
          }

          const ipAddress = req.ip || req.socket.remoteAddress || null;
          const userAgent = req.headers['user-agent'] || null;

          await service
            .logPermissionDenied(
              req.user.id,
              permissionKey,
              ipAddress ?? undefined,
              userAgent ?? undefined
            )
            .catch(() => { });

          res.status(403).json({
            success: false,
            error: 'Insufficient permissions',
            code: 'PERMISSION_DENIED',
          });
          return;
        }
      }

      next();
    } catch (error) {
      const errMsg = (error as Error).message || '';
      if (
        errMsg.includes('does not exist') &&
        permissionKeys.every((key) => legacyRoleGrantsPermission(req.user!.role, key))
      ) {
        next();
        return;
      }
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
}
