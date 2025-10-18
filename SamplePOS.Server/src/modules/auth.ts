import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body } from 'express-validator';
import prisma from '../config/database.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const router = Router();

// ============================================================================
// REGISTER
// ============================================================================

router.post('/register',
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

router.post('/login',
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

router.get('/verify',
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

router.post('/change-password',
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

export default router;
