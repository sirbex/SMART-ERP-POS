// User Controller - HTTP request handlers

import type { Request, Response, NextFunction } from 'express';
import type { Pool } from 'pg';
import * as userService from './userService.js';
import { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema } from '../../../../shared/zod/user.js';
import logger from '../../utils/logger.js';

/**
 * GET /api/users
 * Get all users
 */
export async function getAllUsers(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const users = await userService.getAllUsers(pool);
    res.json({ success: true, data: users });
  } catch (error: any) {
    logger.error('Failed to get users', { error: error.message });
    res.status(500).json({ success: false, error: `Failed to retrieve users: ${error.message}` });
  }
}

/**
 * GET /api/users/:id
 * Get user by ID
 */
export async function getUserById(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const { id } = req.params;
    const user = await userService.getUserById(pool, id);
    res.json({ success: true, data: user });
  } catch (error: any) {
    logger.error('Failed to get user', { error: error.message });
    const status = error.message === 'User not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/users
 * Create new user
 */
export async function createUser(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const data = CreateUserSchema.parse(req.body);
    const user = await userService.createUser(pool, data);
    res.status(201).json({ success: true, data: user });
  } catch (error: any) {
    logger.error('Failed to create user', { error: error.message });

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.errors,
      });
    }

    const status = error.message === 'Email already in use' ? 400 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

/**
 * PUT /api/users/:id
 * Update user
 */
export async function updateUser(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const { id } = req.params;
    const data = UpdateUserSchema.parse(req.body);
    const user = await userService.updateUser(pool, id, data);
    res.json({ success: true, data: user });
  } catch (error: any) {
    logger.error('Failed to update user', { error: error.message });

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.errors,
      });
    }

    const status = error.message === 'User not found' ? 404
      : error.message === 'Email already in use' ? 400
        : 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

/**
 * POST /api/users/:id/change-password
 * Change user password
 */
export async function changePassword(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const { id } = req.params;
    const data = ChangePasswordSchema.parse(req.body);
    await userService.changePassword(pool, id, data);
    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error: any) {
    logger.error('Failed to change password', { error: error.message });

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: 'Invalid input data',
        details: error.errors,
      });
    }

    const status = error.message === 'User not found' ? 404
      : error.message === 'Current password is incorrect' ? 401
        : 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

/**
 * DELETE /api/users/:id?permanent=true
 * Delete user (soft delete by default, hard delete if permanent=true)
 */
export async function deleteUser(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const { id } = req.params;
    const hardDelete = req.query.permanent === 'true';

    // Prevent self-deletion
    if (req.user?.id === id) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete your own account'
      });
    }

    const result = await userService.deleteUser(pool, id, hardDelete);
    res.json({
      success: true,
      message: result.message,
      permanentlyDeleted: result.deleted
    });
  } catch (error: any) {
    logger.error('Failed to delete user', { error: error.message });
    const status = error.message === 'User not found' ? 404 : 500;
    res.status(status).json({ success: false, error: error.message });
  }
}

/**
 * GET /api/users/stats
 * Get user statistics
 */
export async function getUserStats(req: Request, res: Response, next: NextFunction, pool: Pool) {
  try {
    const stats = await userService.getUserStats(pool);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    logger.error('Failed to get user stats', { error: error.message });
    res.status(500).json({ success: false, error: `Failed to retrieve user statistics: ${error.message}` });
  }
}
