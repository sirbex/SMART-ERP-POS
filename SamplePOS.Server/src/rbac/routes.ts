import { Router } from 'express';
import type { Pool } from 'pg';
import { RbacController } from './controller.js';
import { RbacService } from './service.js';
import { authenticate } from '../middleware/auth.js';
import {
  requirePermission,
  attachRbacService,
  loadAuthorizationContext,
} from './middleware.js';

export function createRbacRoutes(pool: Pool): Router {
  const router = Router();
  const service = new RbacService(pool);
  const controller = new RbacController(service);

  router.use(attachRbacService);

  router.get(
    '/permissions',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.permissions_read'),
    (req, res) => controller.getPermissionCatalog(req, res)
  );

  router.post(
    '/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_create'),
    (req, res) => controller.createRole(req, res)
  );

  router.get(
    '/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_read'),
    (req, res) => controller.getAllRoles(req, res)
  );

  router.get(
    '/roles/:roleId',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_read'),
    (req, res) => controller.getRole(req, res)
  );

  router.put(
    '/roles/:roleId',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_update'),
    (req, res) => controller.updateRole(req, res)
  );

  router.delete(
    '/roles/:roleId',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.roles_delete'),
    (req, res) => controller.deleteRole(req, res)
  );

  router.post(
    '/users/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_update'),
    (req, res) => controller.assignRoleToUser(req, res)
  );

  router.delete(
    '/users/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_update'),
    (req, res) => controller.removeRoleFromUser(req, res)
  );

  router.get(
    '/users/:userId/roles',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_read'),
    (req, res) => controller.getUserRoles(req, res)
  );

  router.get(
    '/users/:userId/permissions',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.users_read'),
    (req, res) => controller.getUserPermissions(req, res)
  );

  router.get(
    '/me/roles',
    authenticate,
    loadAuthorizationContext,
    (req, res) => controller.getMyRoles(req, res)
  );

  router.get(
    '/me/permissions',
    authenticate,
    loadAuthorizationContext,
    (req, res) => controller.getMyPermissions(req, res)
  );

  router.get(
    '/me/check-permission',
    authenticate,
    loadAuthorizationContext,
    (req, res) => controller.checkPermission(req, res)
  );

  router.get(
    '/audit-logs',
    authenticate,
    loadAuthorizationContext,
    requirePermission('system.audit_read'),
    (req, res) => controller.getAuditLogs(req, res)
  );

  return router;
}
