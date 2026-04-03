// User Routes

import { Router } from 'express';
import * as userController from './userController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

export function createUserRoutes(): Router {
  const router = Router();

  // All user routes require authentication
  router.use(authenticate);

  // Read operations
  router.get('/', requirePermission('system.users_read'), userController.getAllUsers);
  router.get('/stats', requirePermission('system.users_read'), userController.getUserStats);
  router.get('/:id', requirePermission('system.users_read'), userController.getUserById);

  // Write operations require specific permissions
  router.post('/', requirePermission('system.users_create'), userController.createUser);
  router.put('/:id', requirePermission('system.users_update'), userController.updateUser);
  router.post('/:id/change-password', requirePermission('system.users_update'), userController.changePassword);
  router.post('/:id/reset-password', requirePermission('system.users_update'), userController.resetPassword);
  router.delete('/:id', requirePermission('system.users_delete'), userController.deleteUser);

  return router;
}
