import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import { RbacService, RbacError } from './service.js';
import type { AuthorizationContext } from './types.js';

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthorizationContext;
      rbacService?: RbacService;
    }
  }
}

let rbacServiceInstance: RbacService | null = null;

export function initializeRbacMiddleware(pool: Pool): void {
  rbacServiceInstance = new RbacService(pool);
}

export function getRbacService(): RbacService {
  if (!rbacServiceInstance) {
    throw new Error('RBAC middleware not initialized. Call initializeRbacMiddleware first.');
  }
  return rbacServiceInstance;
}

export function attachRbacService(req: Request, res: Response, next: NextFunction): void {
  if (!rbacServiceInstance) {
    res.status(500).json({
      success: false,
      error: 'Authorization service not available',
    });
    return;
  }
  req.rbacService = rbacServiceInstance;
  next();
}

export async function loadAuthorizationContext(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.user?.id) {
    next();
    return;
  }

  if (!rbacServiceInstance) {
    res.status(500).json({
      success: false,
      error: 'Authorization service not available',
    });
    return;
  }

  try {
    req.authContext = await rbacServiceInstance.buildAuthorizationContext(req.user.id);
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load authorization context',
    });
  }
}

interface RequirePermissionOptions {
  scopeType?: 'global' | 'organization' | 'branch' | 'warehouse';
  scopeIdParam?: string;
  scopeIdBody?: string;
  scopeIdQuery?: string;
}

export function requirePermission(permissionKey: string, options?: RequirePermissionOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    console.log(`[RBAC] requirePermission(${permissionKey}) - user:`, req.user?.id);

    if (!req.user?.id) {
      console.log('[RBAC] No user ID - returning 401');
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!rbacServiceInstance) {
      console.log('[RBAC] No rbacServiceInstance - returning 500');
      res.status(500).json({
        success: false,
        error: 'Authorization service not available',
      });
      return;
    }

    let scopeType: string | null = options?.scopeType || null;
    let scopeId: string | null = null;

    if (options?.scopeIdParam && req.params[options.scopeIdParam]) {
      scopeId = req.params[options.scopeIdParam];
    } else if (options?.scopeIdBody && req.body[options.scopeIdBody]) {
      scopeId = req.body[options.scopeIdBody];
    } else if (options?.scopeIdQuery && req.query[options.scopeIdQuery]) {
      scopeId = req.query[options.scopeIdQuery] as string;
    }

    try {
      console.log(`[RBAC] Checking permission ${permissionKey} for user ${req.user.id}`);
      const hasPermission = await rbacServiceInstance.checkPermission(
        req.user.id,
        permissionKey,
        scopeType,
        scopeId
      );
      console.log(`[RBAC] hasPermission(${permissionKey}):`, hasPermission);

      if (!hasPermission) {
        const ipAddress = req.ip || req.socket.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;

        await rbacServiceInstance.logPermissionDenied(
          req.user.id,
          permissionKey,
          ipAddress ?? undefined,
          userAgent ?? undefined
        );

        console.log(`[RBAC] DENIED: ${req.user.id} lacks permission ${permissionKey}`);
        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'PERMISSION_DENIED',
        });
        return;
      }

      console.log(`[RBAC] GRANTED: ${permissionKey}`);
      next();
    } catch (error) {
      console.error('[RBAC] Error checking permission:', error);
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

    if (!rbacServiceInstance) {
      res.status(500).json({
        success: false,
        error: 'Authorization service not available',
      });
      return;
    }

    let scopeType: string | null = options?.scopeType || null;
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
        const hasPermission = await rbacServiceInstance.checkPermission(
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

      const ipAddress = req.ip || req.socket.remoteAddress || null;
      const userAgent = req.headers['user-agent'] || null;

      await rbacServiceInstance.logPermissionDenied(
        req.user.id,
        permissionKeys.join(','),
        ipAddress ?? undefined,
        userAgent ?? undefined
      );

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'PERMISSION_DENIED',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
}

export function requireAllPermissions(permissionKeys: string[], options?: RequirePermissionOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user?.id) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
      return;
    }

    if (!rbacServiceInstance) {
      res.status(500).json({
        success: false,
        error: 'Authorization service not available',
      });
      return;
    }

    let scopeType: string | null = options?.scopeType || null;
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
        const hasPermission = await rbacServiceInstance.checkPermission(
          req.user.id,
          permissionKey,
          scopeType,
          scopeId
        );

        if (!hasPermission) {
          const ipAddress = req.ip || req.socket.remoteAddress || null;
          const userAgent = req.headers['user-agent'] || null;

          await rbacServiceInstance.logPermissionDenied(
            req.user.id,
            permissionKey,
            ipAddress ?? undefined,
            userAgent ?? undefined
          );

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
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
      });
    }
  };
}
