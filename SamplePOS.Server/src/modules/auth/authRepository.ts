// Auth Repository - Raw SQL queries only
// No business logic, pure data access

import { Pool } from 'pg';

export type UserRole = 'ADMIN' | 'MANAGER' | 'CASHIER' | 'STAFF';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserWithoutPassword {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Find user by email address
 * @param pool - Database connection pool
 * @param email - User email address
 * @returns User record with password hash or null if not found
 */
export async function findUserByEmail(pool: Pool, email: string): Promise<UserRecord | null> {
  const result = await pool.query(
    `SELECT 
      id, email, password_hash as "passwordHash", full_name as "fullName", role, is_active as "isActive",
      created_at as "createdAt", updated_at as "updatedAt"
    FROM users WHERE LOWER(email) = LOWER($1)`,
    [email]
  );
  return result.rows[0] || null;
}

/**
 * Find user by ID
 * @param pool - Database connection pool
 * @param userId - User ID
 * @returns User record without password hash or null if not found
 */
export async function findUserById(pool: Pool, userId: string): Promise<UserWithoutPassword | null> {
  const result = await pool.query(
    `SELECT 
      id, email, full_name as "fullName", role, is_active as "isActive",
      created_at as "createdAt", updated_at as "updatedAt"
    FROM users WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

/**
 * Create new user
 * @param pool - Database connection pool
 * @param data - User creation data with hashed password
 * @returns Created user record without password hash
 */
export async function createUser(
  pool: Pool,
  data: {
    email: string;
    passwordHash: string;
    fullName: string;
    role: string;
  }
): Promise<UserWithoutPassword> {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING 
      id, email, full_name as "fullName", role, is_active as "isActive",
      created_at as "createdAt", updated_at as "updatedAt"`,
    [data.email, data.passwordHash, data.fullName, data.role]
  );
  return result.rows[0];
}
