// User Routes

import { Router } from 'express';
import type { Pool } from 'pg';
import * as userController from './userController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

export function createUserRoutes(pool: Pool): Router {
  const router = Router();

  // All user routes require authentication and user-management permissions
  router.use(authenticate);
  router.use(requirePermission('system.users_read'));

  // GET /api/users - Get all users
  router.get('/', (req, res, next) => userController.getAllUsers(req, res, next, pool));

  // GET /api/users/stats - Get user statistics
  router.get('/stats', (req, res, next) => userController.getUserStats(req, res, next, pool));

  // GET /api/users/:id - Get user by ID
  router.get('/:id', (req, res, next) => userController.getUserById(req, res, next, pool));

  // POST /api/users - Create new user
  router.post('/', (req, res, next) => userController.createUser(req, res, next, pool));

  // PUT /api/users/:id - Update user
  router.put('/:id', (req, res, next) => userController.updateUser(req, res, next, pool));

  // POST /api/users/:id/change-password - Change user password
  router.post('/:id/change-password', (req, res, next) => userController.changePassword(req, res, next, pool));

  // DELETE /api/users/:id - Delete user
  router.delete('/:id', (req, res, next) => userController.deleteUser(req, res, next, pool));

  return router;
}
