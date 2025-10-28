import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { CreateUserSchema, UpdateUserSchema, ChangePasswordSchema } from '../validation/user.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

const router = Router();

// Validation schemas
// GET /api/users - List all users
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, role, isActive } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { username: { contains: search as string, mode: 'insensitive' } },
          { fullName: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
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
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            username: true,
            email: true,
            fullName: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.user.count({ where }),
      ]);

      logger.info(`Listed ${users.length} users`, { userId: (req as any).user?.id });

      res.json(buildPaginationResponse(users, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/users/:id - Get single user
router.get(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      logger.info(`Retrieved user: ${user.username}`, { userId: (req as any).user?.id });

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/users - Create new user
router.post(
  '/',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { username, email, password, fullName, role = 'CASHIER' } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
      });

      if (existingUser) {
        return res.status(409).json({ error: 'Username or email already exists' });
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
          role,
        },
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
        },
      });

      logger.info(`Created user: ${user.username}`, { userId: (req as any).user?.id });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/users/:id - Update user
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { username, email, fullName, role, isActive, password } = req.body;

      const updateData: any = {
        username,
        email,
        fullName,
        role,
        isActive,
      };

      // Hash password if provided
      if (password) {
        updateData.passwordHash = await bcrypt.hash(password, 10);
      }

      const user = await prisma.user.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      logger.info(`Updated user: ${user.username}`, { userId: (req as any).user?.id });

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/users/:id - Delete user
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const user = await prisma.user.delete({
        where: { id },
        select: {
          id: true,
          username: true,
          email: true,
          fullName: true,
        },
      });

      logger.info(`Deleted user: ${user.username}`, { userId: (req as any).user?.id });

      res.json({ message: 'User deleted successfully', user });
    } catch (error) {
      next(error);
    }
  }
);

export default router;

