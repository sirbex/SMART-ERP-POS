// ============================================================================
// AUTH & USER MODULES
// ============================================================================

// ============================================================================
// FILE: pos-backend/src/modules/auth.ts
// ============================================================================

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import { prisma } from '../config/database.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { logger } from '../utils/logger.js';

export const authRouter = Router();

// ============================================================================
// REGISTER
// ============================================================================

authRouter.post('/register',
  validate([
    body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Invalid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('role').optional().isIn(['ADMIN', 'MANAGER', 'CASHIER']).withMessage('Invalid role')
  ]),
  asyncHandler(async (req, res) => {
    const { username, email, password, fullName, role = 'CASHIER' } = req.body;

    // Check if user exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username }, { email }]
      }
    });

    if (existingUser) {
      throw createError('Username or email already exists', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username,
        email,
        passwordHash,
        fullName,
        role
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });

    logger.info(`User registered: ${username}`);

    res.status(201).json({
      message: 'User registered successfully',
      user
    });
  })
);

// ============================================================================
// LOGIN
// ============================================================================

authRouter.post('/login',
  validate([
    body('username').trim().notEmpty().withMessage('Username is required'),
    body('password').notEmpty().withMessage('Password is required')
  ]),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Find user
    const user = await prisma.user.findUnique({
      where: { username }
    });

    if (!user) {
      throw createError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      throw createError('Account is inactive', 403);
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      throw createError('Invalid credentials', 401);
    }

    // Generate token
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role
      },
      process.env.JWT_SECRET!,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info(`User logged in: ${username}`);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        role: user.role
      }
    });
  })
);

// ============================================================================
// VERIFY TOKEN
// ============================================================================

authRouter.get('/verify',
  asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      throw createError('No token provided', 401);
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        id: string;
        username: string;
        role: string;
      };

      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true
        }
      });

      if (!user || !user.isActive) {
        throw createError('Invalid token', 401);
      }

      res.json({ valid: true, user });
    } catch (error) {
      throw createError('Invalid token', 401);
    }
  })
);

// ============================================================================
// CHANGE PASSWORD
// ============================================================================

authRouter.post('/change-password',
  validate([
    body('username').trim().notEmpty(),
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 6 })
  ]),
  asyncHandler(async (req, res) => {
    const { username, currentPassword, newPassword } = req.body;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw createError('User not found', 404);
    }

    const validPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!validPassword) {
      throw createError('Current password is incorrect', 401);
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    });

    logger.info(`Password changed for user: ${username}`);

    res.json({ message: 'Password changed successfully' });
  })
);

// ============================================================================
// FILE: pos-backend/src/modules/users.ts
// ============================================================================

import { Router } from 'express';
import { body, param } from 'express-validator';
import { UserRole } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { parsePagination, buildPaginationResponse, sanitizeSearchQuery } from '../utils/helpers.js';

export const userRouter = Router();

// All routes require authentication
userRouter.use(authenticate);

// ============================================================================
// GET ALL USERS
// ============================================================================

userRouter.get('/',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  asyncHandler(async (req, res) => {
    const { page, limit, search, role, isActive } = req.query;
    const pagination = parsePagination(page as string, limit as string);

    const where: any = {};

    if (search) {
      const searchTerm = sanitizeSearchQuery(search as string);
      where.OR = [
        { username: { contains: searchTerm, mode: 'insensitive' } },
        { fullName: { contains: searchTerm, mode: 'insensitive' } },
        { email: { contains: searchTerm, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role = role;
    }

    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.user.count({ where })
    ]);

    res.json(buildPaginationResponse(users, total, pagination));
  })
);

// ============================================================================
// GET USER BY ID
// ============================================================================

userRouter.get('/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate([param('id').isString()]),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            sales: true,
            purchases: true
          }
        }
      }
    });

    if (!user) {
      throw createError('User not found', 404);
    }

    res.json(user);
  })
);

// ============================================================================
// UPDATE USER
// ============================================================================

userRouter.put('/:id',
  authorize(UserRole.ADMIN),
  validate([
    param('id').isString(),
    body('email').optional().isEmail(),
    body('fullName').optional().trim().notEmpty(),
    body('role').optional().isIn(['ADMIN', 'MANAGER', 'CASHIER']),
    body('isActive').optional().isBoolean()
  ]),
  asyncHandler(async (req, res) => {
    const { email, fullName, role, isActive } = req.body;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        ...(email && { email }),
        ...(fullName && { fullName }),
        ...(role && { role }),
        ...(isActive !== undefined && { isActive })
      },
      select: {
        id: true,
        username: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        updatedAt: true
      }
    });

    res.json({ message: 'User updated successfully', user });
  })
);

// ============================================================================
// DELETE USER (soft delete by deactivating)
// ============================================================================

userRouter.delete('/:id',
  authorize(UserRole.ADMIN),
  validate([param('id').isString()]),
  asyncHandler(async (req, res) => {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isActive: false }
    });

    res.json({ message: 'User deactivated successfully' });
  })
);

console.log('✅ Auth & User modules template created');
console.log('📁 Split into: modules/auth.ts, modules/users.ts');
