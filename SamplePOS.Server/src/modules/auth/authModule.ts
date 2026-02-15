// Auth Module - JWT Authentication
// Combined Repository, Service, Controller, Routes

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import pool from '../../db/pool.js';
import { LoginSchema, CreateUserSchema } from '../../../../shared/zod/user.js';
import { authenticate, authorize, generateToken } from '../../middleware/auth.js';

// Repository
async function findUserByEmail(email: string) {
  const result = await pool.query(
    `SELECT 
      id, email, password_hash as "passwordHash", full_name as "fullName", role, is_active as "isActive",
      created_at as "createdAt", updated_at as "updatedAt"
    FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

async function createUser(data: any) {
  const hashedPassword = await bcrypt.hash(data.password, 12);
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)
     RETURNING 
      id, email, full_name as "fullName", role, is_active as "isActive",
      created_at as "createdAt", updated_at as "updatedAt"`,
    [data.email, hashedPassword, data.fullName, data.role]
  );
  return result.rows[0];
}

// Controllers
export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = LoginSchema.parse(req.body);

    const user = await findUserByEmail(validatedData.email);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    if (!user.isActive) {
      return res.status(401).json({ success: false, error: 'Account is disabled' });
    }

    const isValidPassword = await bcrypt.compare(validatedData.password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = generateToken(user);

    // Remove password hash before sending
    delete user.passwordHash;

    res.json({
      success: true,
      data: {
        user,
        token,
      },
      message: 'Login successful',
    });
  } catch (error) {
    next(error);
  }
}

export async function register(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = CreateUserSchema.parse(req.body);

    // Check if user already exists
    const existing = await findUserByEmail(validatedData.email);
    if (existing) {
      return res.status(400).json({ success: false, error: 'Email already registered' });
    }

    const user = await createUser(validatedData);
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      data: {
        user,
        token,
      },
      message: 'User registered successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function getProfile(req: Request, res: Response, next: NextFunction) {
  try {
    // req.user is set by authenticate middleware
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const result = await pool.query(
      `SELECT 
        id, email, full_name as "fullName", role, is_active as "isActive",
        created_at as "createdAt", updated_at as "updatedAt"
      FROM users WHERE id = $1`,
      [userId]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    res.json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
}

// Routes
const router = Router();

// Public routes
router.post('/login', login);
router.post('/register', register);

// Protected routes
router.get('/profile', authenticate, getProfile);

export default router;
