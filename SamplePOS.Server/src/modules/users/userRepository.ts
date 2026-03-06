// User Repository - Database layer for user CRUD operations
// Contains ONLY SQL queries - NO business logic

import { pool as globalPool } from '../../db/pool.js';
import type pg from 'pg';
import type { User, CreateUser, UpdateUser } from '../../../../shared/zod/user.js';
import bcrypt from 'bcrypt';

/** Accept both Pool (normal queries) and PoolClient (inside transactions) */
type DbClient = pg.Pool | pg.PoolClient;

const SALT_ROUNDS = 12;

/**
 * Find all users (excluding password hashes)
 */
export async function findAllUsers(dbPool?: DbClient): Promise<User[]> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id,
      user_number as "userNumber",
      email,
      full_name as "fullName",
      role,
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM users 
    ORDER BY created_at DESC`
  );

  return result.rows;
}

/**
 * Find user by ID (excluding password hash)
 */
export async function findUserById(id: string, dbPool?: DbClient): Promise<User | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id,
      user_number as "userNumber",
      email,
      full_name as "fullName",
      role,
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM users 
    WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

/**
 * Find user by email (excluding password hash)
 */
export async function findUserByEmail(email: string, dbPool?: DbClient): Promise<User | null> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT 
      id,
      user_number as "userNumber",
      email,
      full_name as "fullName",
      role,
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM users 
    WHERE email = $1`,
    [email]
  );

  return result.rows[0] || null;
}

/**
 * Create a new user
 */
export async function createUser(data: CreateUser, dbPool?: DbClient): Promise<User> {
  const pool = dbPool || globalPool;
  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

  const result = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role, is_active, user_number)
     VALUES ($1, $2, $3, $4, $5, 'USR-' || LPAD(nextval('user_number_seq')::TEXT, 4, '0'))
     RETURNING 
      id,
      user_number as "userNumber",
      email,
      full_name as "fullName",
      role,
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [data.email, passwordHash, data.fullName, data.role, true]
  );

  return result.rows[0];
}

/**
 * Update user details
 */
export async function updateUser(id: string, data: UpdateUser, dbPool?: DbClient): Promise<User | null> {
  const pool = dbPool || globalPool;
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (data.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(data.email);
  }
  if (data.fullName !== undefined) {
    fields.push(`full_name = $${paramIndex++}`);
    values.push(data.fullName);
  }
  if (data.role !== undefined) {
    fields.push(`role = $${paramIndex++}`);
    values.push(data.role);
  }
  if (data.isActive !== undefined) {
    fields.push(`is_active = $${paramIndex++}`);
    values.push(data.isActive);
  }

  if (fields.length === 0) {
    return findUserById(id);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE users 
     SET ${fields.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING 
      id,
      user_number as "userNumber",
      email,
      full_name as "fullName",
      role,
      is_active as "isActive",
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    values
  );

  return result.rows[0] || null;
}

/**
 * Change user password
 */
export async function changeUserPassword(id: string, newPassword: string, dbPool?: DbClient): Promise<boolean> {
  const pool = dbPool || globalPool;
  const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  const result = await pool.query(
    `UPDATE users 
     SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2`,
    [passwordHash, id]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Delete user (soft delete by setting is_active = false)
 */
/**
 * Check if user has any associated data
 */
export async function userHasData(id: string, dbPool?: DbClient): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `SELECT EXISTS (
      SELECT 1 FROM purchase_orders WHERE created_by_id = $1
      UNION ALL
      SELECT 1 FROM goods_receipts WHERE received_by_id = $1
      UNION ALL
      SELECT 1 FROM stock_movements WHERE created_by_id = $1
      UNION ALL
      SELECT 1 FROM sales WHERE cashier_id = $1
      UNION ALL
      SELECT 1 FROM stock_counts WHERE created_by_id = $1
      UNION ALL
      SELECT 1 FROM stock_counts WHERE validated_by_id = $1
    ) AS has_data`,
    [id]
  );

  return result.rows[0]?.has_data || false;
}

/**
 * Soft delete user (set is_active = false)
 */
export async function deleteUser(id: string, dbPool?: DbClient): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `UPDATE users 
     SET is_active = false, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [id]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Hard delete user (permanent deletion)
 * Only allowed if user has no associated data
 */
export async function hardDeleteUser(id: string, dbPool?: DbClient): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    `DELETE FROM users WHERE id = $1`,
    [id]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

/**
 * Verify user password (used for authentication and password change)
 */
export async function verifyUserPassword(email: string, password: string, dbPool?: DbClient): Promise<boolean> {
  const pool = dbPool || globalPool;
  const result = await pool.query(
    'SELECT password_hash FROM users WHERE email = $1 AND is_active = true',
    [email]
  );

  if (result.rows.length === 0) {
    return false;
  }

  return bcrypt.compare(password, result.rows[0].password_hash);
}

/**
 * Count active users
 */
export async function countUsers(dbPool?: DbClient): Promise<number> {
  const pool = dbPool || globalPool;
  const result = await pool.query('SELECT COUNT(*) as count FROM users WHERE is_active = true');
  return parseInt(result.rows[0].count, 10);
}
