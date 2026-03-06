// User Routes

import { Router } from 'express';
import * as userController from './userController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

export function createUserRoutes(): Router {
  const router = Router();

  // All user routes require authentication and user-management permissions
  router.use(authenticate);
  router.use(requirePermission('system.users_read'));

  // GET /api/users - Get all users
  router.get('/', userController.getAllUsers);

  // GET /api/users/stats - Get user statistics
  router.get('/stats', userController.getUserStats);

  // GET /api/users/:id - Get user by ID
  router.get('/:id', userController.getUserById);

  // POST /api/users - Create new user
  router.post('/', userController.createUser);

  // PUT /api/users/:id - Update user
  router.put('/:id', userController.updateUser);

  // POST /api/users/:id/change-password - Change user password
  router.post('/:id/change-password', userController.changePassword);

  // DELETE /api/users/:id - Delete user
  router.delete('/:id', userController.deleteUser);

  return router;
}
