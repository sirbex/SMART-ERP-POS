import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { LoginSchema, RegisterSchema, ChangePasswordSchema } from '../validation/auth.js';
import prisma from '../config/database.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

const router = Router();

// ============================================================================
// REGISTER
// ============================================================================

router.post('/register', asyncHandler(async (req: Request, res: Response) => {
    // Validate request body with Zod
    const validatedData = RegisterSchema.parse(req.body);
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

router.post('/login', asyncHandler(async (req: Request, res: Response) => {
    // Validate request body with Zod
    const validatedData = LoginSchema.parse(req.body);
    const { username, password } = validatedData;

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
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' } as any
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
  asyncHandler(async (req: Request, res: Response) => {
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

router.post('/change-password', asyncHandler(async (req: Request, res: Response) => {
    // Validate request body with Zod
    const validatedData = ChangePasswordSchema.parse(req.body);
    const { currentPassword, newPassword } = validatedData;

    // Get user from JWT token (assuming middleware sets req.user)
    const userId = (req as any).user?.id;
    if (!userId) {
      throw createError('Authentication required', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
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

    logger.info(`Password changed for user: ${user.username}`);

    res.json({ message: 'Password changed successfully' });
  })
);

export default router;





