import { Router } from 'express';
import type { Request } from 'express';
import type { Pool } from 'pg';
import { RbacController } from './controller.js';
import { RbacService } from './service.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  requirePermission,
  attachRbacService,
  loadAuthorizationContext,
} from './middleware.js';

export function createRbacRoutes(pool: Pool): Router {
  const router = Router();
  // Use a factory that builds a tenant-aware controller per request
  const fallbackService = new RbacService(pool);
  const fallbackController = new RbacController(fallbackService);

  // Middleware to resolve the correct RbacService per tenant
  router.use((req, res, next) => {
    const tenantPool = req.tenantPool || pool;
    if (tenantPool !== pool) {
      // Multi-tenant: create tenant-scoped service
      const tenantService = new RbacService(tenantPool);
      (req as unknown as Record<string, unknown>)._rbacController = new RbacController(tenantService);
    }
    next();
  });

  function getController(req: Request): RbacController {
    return ((req as unknown as Record<string, unknown>)._rbacController as RbacController) || fallbackController;
  }

  router.use(attachRbacService);

  router.get(
    '/permissions',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.permissions_read'),
    asyncHandler(async (req, res) => getController(req).getPermissionCatalog(req, res))
  );

  router.post(
    '/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_create'),
    asyncHandler(async (req, res) => getController(req).createRole(req, res))
  );

  router.get(
    '/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_read'),
    asyncHandler(async (req, res) => getController(req).getAllRoles(req, res))
  );

  router.get(
    '/roles/:roleId',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_read'),
    asyncHandler(async (req, res) => getController(req).getRole(req, res))
  );

  router.put(
    '/roles/:roleId',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_update'),
    asyncHandler(async (req, res) => getController(req).updateRole(req, res))
  );

  router.delete(
    '/roles/:roleId',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_delete'),
    asyncHandler(async (req, res) => getController(req).deleteRole(req, res))
  );

  router.post(
    '/users/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_update'),
    asyncHandler(async (req, res) => getController(req).assignRoleToUser(req, res))
  );

  router.delete(
    '/users/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_update'),
    asyncHandler(async (req, res) => getController(req).removeRoleFromUser(req, res))
  );

  router.get(
    '/users/:userId/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_read'),
    asyncHandler(async (req, res) => getController(req).getUserRoles(req, res))
  );

  router.get(
    '/users/:userId/permissions',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_read'),
    asyncHandler(async (req, res) => getController(req).getUserPermissions(req, res))
  );

  router.get(
    '/me/roles',
    authenticate,
    loadAuthorizationContext,
    asyncHandler(async (req, res) => getController(req).getMyRoles(req, res))
  );

  router.get(
    '/me/permissions',
    authenticate,
    loadAuthorizationContext,
    asyncHandler(async (req, res) => getController(req).getMyPermissions(req, res))
  );

  router.get(
    '/me/check-permission',
    authenticate,
    loadAuthorizationContext,
    asyncHandler(async (req, res) => getController(req).checkPermission(req, res))
  );

  router.get(
    '/audit-logs',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.audit_read'),
    asyncHandler(async (req, res) => getController(req).getAuditLogs(req, res))
  );

  return router;
}
