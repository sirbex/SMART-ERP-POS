// User Service - Business logic layer for user operations

import type { Pool } from 'pg';
import * as userRepository from './userRepository.js';
import type { User, CreateUser, UpdateUser, ChangePassword } from '../../../../shared/zod/user.js';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

/**
 * Get all users (admin/manager only)
 * @param pool - Database connection pool
 * @returns List of all users (passwords excluded)
 * 
 * Features:
 * - Excludes password_hash for security
 * - Includes active and inactive users
 * - Role information included
 * 
 * Use Cases:
 * - Admin user management dashboard
 * - User selection dropdowns
 * - Audit reports
 */
export async function getAllUsers(pool: Pool): Promise<User[]> {
  return userRepository.findAllUsers(pool);
}

/**
 * Get user by ID
 */
export async function getUserById(pool: Pool, id: string): Promise<User> {
  const user = await userRepository.findUserById(id, pool);

  if (!user) {
    throw new Error('User not found');
  }

  return user;
}

/**
 * Create new user with role assignment (ATOMIC TRANSACTION)
 * @param pool - Database connection pool
 * @param data - User creation data (email, password, name, role)
 * @returns Created user with auto-generated user_number
 * @throws Error if email already exists
 * 
 * Business Rules:
 * - Email must be unique across all users
 * - Password hashed using bcrypt (salt rounds: 12)
 * - user_number auto-generated: USER-YYYY-####
 * 
 * Roles:
 * - ADMIN: Full system access
 * - MANAGER: Sales, inventory, reports (no system settings)
 * - CASHIER: POS operations only
 * - STAFF: Limited read access
 * 
 * Transaction Flow:
 * 1. Validate email uniqueness
 * 2. Hash password with bcrypt
 * 3. Create user record
 * 4. Commit transaction atomically
 * 
 * Security:
 * - Password never stored in plain text
 * - Bcrypt with salt for one-way hashing
 * - Rate limiting on auth endpoints (middleware)
 */
export async function createUser(pool: Pool, data: CreateUser): Promise<User> {
  // Check if email already exists
  const existingUser = await userRepository.findUserByEmail(data.email, pool);

  if (existingUser) {
    throw new Error('Email already in use');
  }

  // Transaction: Create user atomically with role assignment
  return UnitOfWork.run(pool, async (client) => {
    const user = await userRepository.createUser(data, client);
    logger.info('User created (transaction committed)', {
      userId: user.id,
      email: user.email,
      role: user.role
    });
    return user;
  });
}

/**
 * Update user details (partial update supported)
 * @param pool - Database connection pool
 * @param id - User UUID to update
 * @param data - Fields to update (all optional)
 * @returns Updated user record
 * @throws Error if email conflict or user not found
 * 
 * Updatable Fields:
 * - email (with uniqueness validation)
 * - name, phone
 * - role (ADMIN, MANAGER, CASHIER, STAFF)
 * - is_active (soft delete)
 * 
 * Business Rules:
 * - Cannot change email to one already in use
 * - Cannot update password via this endpoint (use changePassword)
 * - Audit trail: updated_at timestamp auto-updated
 * 
 * Security:
 * - Only ADMIN can change user roles
 * - Users can update own profile (limited fields)
 * - Password changes require old password verification
 */
export async function updateUser(pool: Pool, id: string, data: UpdateUser): Promise<User> {
  // If email is being changed, check it's not already in use
  if (data.email) {
    const existingUser = await userRepository.findUserByEmail(data.email, pool);
    if (existingUser && existingUser.id !== id) {
      throw new Error('Email already in use');
    }
  }

  // Transaction: Update user atomically with role changes
  return UnitOfWork.run(pool, async (client) => {
    const user = await userRepository.updateUser(id, data, client);

    if (!user) {
      throw new Error('User not found');
    }

    logger.info('User updated (transaction committed)', {
      userId: user.id,
      updates: Object.keys(data)
    });

    return user;
  });
}

/**
 * Change user password
 */
export async function changePassword(
  pool: Pool,
  userId: string,
  data: ChangePassword
): Promise<void> {
  const user = await userRepository.findUserById(userId, pool);

  if (!user) {
    throw new Error('User not found');
  }

  // Verify current password
  const isValid = await userRepository.verifyUserPassword(user.email, data.currentPassword, pool);

  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  const success = await userRepository.changeUserPassword(userId, data.newPassword, pool);

  if (!success) {
    throw new Error('Failed to change password');
  }

  logger.info('Password changed', { userId });
}

/**
 * Delete user (soft delete by default, hard delete if specified)
 */
export async function deleteUser(pool: Pool, id: string, hardDelete: boolean = false): Promise<{ deleted: boolean; message: string }> {
  const user = await userRepository.findUserById(id, pool);

  if (!user) {
    throw new Error('User not found');
  }

  // Check if user has associated data
  const hasData = await userRepository.userHasData(id, pool);

  if (hardDelete) {
    if (hasData) {
      throw new Error('Cannot permanently delete user with associated transactions. Please deactivate instead.');
    }
    const success = await userRepository.hardDeleteUser(id, pool);
    if (!success) {
      throw new Error('Failed to delete user');
    }
    logger.info('User permanently deleted', { userId: id, email: user.email });
    return { deleted: true, message: 'User permanently deleted' };
  } else {
    const success = await userRepository.deleteUser(id, pool);
    if (!success) {
      throw new Error('Failed to deactivate user');
    }
    logger.info('User deactivated', { userId: id, email: user.email });
    return { deleted: false, message: 'User deactivated successfully' };
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(pool: Pool) {
  const total = await userRepository.countUsers(pool);
  const users = await userRepository.findAllUsers(pool);

  const roleCount = users.reduce((acc, user) => {
    acc[user.role] = (acc[user.role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    total,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
    byRole: roleCount,
  };
}
