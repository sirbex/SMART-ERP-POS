import { Router } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body, query } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

const router = Router();

// Validation schemas
const createUserValidation = [
  body('username').trim().isLength({ min: 3, max: 50 }).withMessage('Username must be 3-50 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Invalid email address'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('fullName').trim().isLength({ min: 1, max: 100 }).withMessage('Full name is required'),
  body('role').isIn(['ADMIN', 'MANAGER', 'CASHIER']).withMessage('Invalid role'),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean'),
];

const updateUserValidation = [
  body('username').optional().trim().isLength({ min: 3, max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('fullName').optional().trim().isLength({ min: 1, max: 100 }),
  body('role').optional().isIn(['ADMIN', 'MANAGER', 'CASHIER']),
  body('isActive').optional().isBoolean(),
];

const changePasswordValidation = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
];

// GET /api/users - List all users (Admin/Manager only)
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, role, isActive } = req.query;

      // Build where clause
      const where: any = {};
      
      if (search) {
        where.OR = [
          { username: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { fullName: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      if (role) {
        where.role = role;
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      // Get users and total count
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
            updatedAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.user.count({ where }),
      ]);

      logger.info(`Listed ${users.length} users`, { userId: req.user?.id });

      res.json(buildPaginationResponse(users, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/users/:id - Get single user (Admin/Manager or own profile)
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const requestingUser = req.user!;

      // Check authorization - Admin/Manager can view any, others only their own
      if (
        requestingUser.role !== 'ADMIN' &&
        requestingUser.role !== 'MANAGER' &&
        requestingUser.id !== id
      ) {
        return res.status(403).json({ error: 'Forbidden: Cannot view other users' });
      }

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

      logger.info(`Retrieved user: ${user.username}`, { userId: requestingUser.id });

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/users - Create new user (Admin only)
router.post(
  '/',
  authenticate,
  authorize(['ADMIN']),
  createUserValidation,
  validate,
  async (req, res, next) => {
    try {
      const { username, email, password, fullName, role, isActive } = req.body;

      // Check if username or email already exists
      const existing = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
      });

      if (existing) {
        return res.status(400).json({
          error: existing.username === username
            ? 'Username already exists'
            : 'Email already exists',
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          fullName,
          role,
          isActive: isActive ?? true,
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

      logger.info(`Created user: ${user.username}`, { userId: req.user?.id });

      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/users/:id - Update user (Admin or own profile with restrictions)
router.put(
  '/:id',
  authenticate,
  updateUserValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const requestingUser = req.user!;
      const { username, email, fullName, role, isActive } = req.body;

      // Check if user exists
      const existingUser = await prisma.user.findUnique({ where: { id } });
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Authorization check
      const isOwnProfile = requestingUser.id === id;
      const isAdmin = requestingUser.role === 'ADMIN';

      if (!isOwnProfile && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Cannot update other users' });
      }

      // Regular users cannot change their role or active status
      if (isOwnProfile && !isAdmin) {
        if (role !== undefined || isActive !== undefined) {
          return res.status(403).json({
            error: 'Forbidden: Cannot change your own role or active status',
          });
        }
      }

      // Prepare update data
      const updateData: any = {};
      if (username) updateData.username = username;
      if (email) updateData.email = email;
      if (fullName) updateData.fullName = fullName;
      if (role && isAdmin) updateData.role = role;
      if (isActive !== undefined && isAdmin) updateData.isActive = isActive;

      // Check for duplicate username/email
      if (username || email) {
        const duplicate = await prisma.user.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  ...(username ? [{ username }] : []),
                  ...(email ? [{ email }] : []),
                ],
              },
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.username === username
              ? 'Username already exists'
              : 'Email already exists',
          });
        }
      }

      // Update user
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
          updatedAt: true,
        },
      });

      logger.info(`Updated user: ${user.username}`, { userId: requestingUser.id });

      res.json(user);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/users/:id - Delete user (Admin only, cannot delete self)
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const requestingUser = req.user!;

      // Cannot delete yourself
      if (requestingUser.id === id) {
        return res.status(400).json({ error: 'Cannot delete your own account' });
      }

      // Check if user exists
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Delete user
      await prisma.user.delete({ where: { id } });

      logger.info(`Deleted user: ${user.username}`, { userId: requestingUser.id });

      res.json({ message: 'User deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/users/:id/change-password - Change user password (Admin or own profile)
router.post(
  '/:id/change-password',
  authenticate,
  changePasswordValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const requestingUser = req.user!;
      const { currentPassword, newPassword } = req.body;

      // Check authorization
      const isOwnProfile = requestingUser.id === id;
      const isAdmin = requestingUser.role === 'ADMIN';

      if (!isOwnProfile && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: Cannot change other users\' passwords' });
      }

      // Get user
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Verify current password (required even for admins changing others' passwords)
      const passwordMatch = await bcrypt.compare(currentPassword, user.password);
      if (!passwordMatch) {
        return res.status(401).json({ error: 'Current password is incorrect' });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password
      await prisma.user.update({
        where: { id },
        data: { password: hashedPassword },
      });

      logger.info(`Changed password for user: ${user.username}`, { userId: requestingUser.id });

      res.json({ message: 'Password changed successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/users/:id/toggle-active - Toggle user active status (Admin only)
router.post(
  '/:id/toggle-active',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const requestingUser = req.user!;

      // Cannot toggle own status
      if (requestingUser.id === id) {
        return res.status(400).json({ error: 'Cannot toggle your own active status' });
      }

      // Get user
      const user = await prisma.user.findUnique({ where: { id } });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Toggle active status
      const updatedUser = await prisma.user.update({
        where: { id },
        data: { isActive: !user.isActive },
        select: {
          id: true,
          username: true,
          isActive: true,
        },
      });

      logger.info(
        `Toggled active status for user: ${updatedUser.username} to ${updatedUser.isActive}`,
        { userId: requestingUser.id }
      );

      res.json(updatedUser);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/users/stats - Get user statistics (Admin/Manager only)
router.get(
  '/stats/overview',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const [totalUsers, activeUsers, byRole] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { isActive: true } }),
        prisma.user.groupBy({
          by: ['role'],
          _count: true,
        }),
      ]);

      const stats = {
        totalUsers,
        activeUsers,
        inactiveUsers: totalUsers - activeUsers,
        byRole: byRole.reduce((acc, { role, _count }) => {
          acc[role] = _count;
          return acc;
        }, {} as Record<string, number>),
      };

      logger.info('Retrieved user statistics', { userId: req.user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
