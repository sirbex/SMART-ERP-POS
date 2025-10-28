import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';
import { z } from 'zod';
import { PricingCacheService } from '../services/pricingCacheService.js';

const router = Router();

// Validation schemas
const CreateCustomerGroupSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  discount: z.number().min(0).max(1).default(0),
  isActive: z.boolean().default(true),
});

const UpdateCustomerGroupSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  discount: z.number().min(0).max(1).optional(),
  isActive: z.boolean().optional(),
});

// GET /api/customer-groups - List all customer groups
router.get(
  '/',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, isActive } = req.query;

      const where: any = {};

      if (search) {
        where.name = { contains: search as string, mode: 'insensitive' };
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [groups, total] = await Promise.all([
        prisma.customerGroup.findMany({
          where,
          skip,
          take: limit,
          orderBy: { name: 'asc' },
          include: {
            _count: {
              select: {
                customers: true,
                pricingTiers: true,
              },
            },
          },
        }),
        prisma.customerGroup.count({ where }),
      ]);

      logger.info(`Listed ${groups.length} customer groups`, { userId: (req as any).user?.id });

      res.json(buildPaginationResponse(groups, total, { page, limit, skip }));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/customer-groups/:id - Get single customer group
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const group = await prisma.customerGroup.findUnique({
        where: { id },
        include: {
          customers: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
          pricingTiers: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  barcode: true,
                },
              },
            },
          },
        },
      });

      if (!group) {
        return res.status(404).json({ error: 'Customer group not found' });
      }

      logger.info(`Retrieved customer group: ${group.name}`, { userId: (req as any).user?.id });

      res.json({
        success: true,
        data: group,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/customer-groups - Create customer group
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = CreateCustomerGroupSchema.parse(req.body);

      // Check for duplicate name
      const existing = await prisma.customerGroup.findUnique({
        where: { name: validatedData.name },
      });

      if (existing) {
        return res.status(409).json({ error: 'Customer group with this name already exists' });
      }

      const group = await prisma.customerGroup.create({
        data: validatedData,
      });

      logger.info(`Customer group created: ${group.name}`, {
        userId: (req as any).user?.id,
        groupId: group.id,
      });

      res.status(201).json({
        success: true,
        message: 'Customer group created successfully',
        data: group,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      next(error);
    }
  }
);

// PUT /api/customer-groups/:id - Update customer group
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validatedData = UpdateCustomerGroupSchema.parse(req.body);

      // Check if exists
      const existing = await prisma.customerGroup.findUnique({
        where: { id },
      });

      if (!existing) {
        return res.status(404).json({ error: 'Customer group not found' });
      }

      // Check for name conflict
      if (validatedData.name) {
        const nameConflict = await prisma.customerGroup.findFirst({
          where: {
            name: validatedData.name,
            id: { not: id },
          },
        });

        if (nameConflict) {
          return res.status(409).json({ error: 'Customer group with this name already exists' });
        }
      }

      const updated = await prisma.customerGroup.update({
        where: { id },
        data: validatedData,
      });

      // Invalidate pricing cache for this group
      PricingCacheService.invalidateCustomerGroup(id);

      logger.info(`Customer group updated: ${updated.name}`, {
        userId: (req as any).user?.id,
        groupId: id,
      });

      res.json({
        success: true,
        message: 'Customer group updated successfully',
        data: updated,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Validation failed', details: error.errors });
      }
      next(error);
    }
  }
);

// DELETE /api/customer-groups/:id - Delete customer group
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const group = await prisma.customerGroup.findUnique({
        where: { id },
        include: {
          _count: {
            select: {
              customers: true,
              pricingTiers: true,
            },
          },
        },
      });

      if (!group) {
        return res.status(404).json({ error: 'Customer group not found' });
      }

      // Check if group has customers or pricing tiers
      if (group._count.customers > 0 || group._count.pricingTiers > 0) {
        // Deactivate instead of delete
        await prisma.customerGroup.update({
          where: { id },
          data: { isActive: false },
        });

        // Invalidate cache
        PricingCacheService.invalidateCustomerGroup(id);

        logger.info(`Customer group deactivated: ${group.name}`, {
          userId: (req as any).user?.id,
          groupId: id,
          reason: 'Has associated records',
        });

        return res.json({
          success: true,
          message: 'Customer group deactivated (has associated customers or pricing tiers)',
        });
      }

      // Safe to delete
      await prisma.customerGroup.delete({
        where: { id },
      });

      // Invalidate cache
      PricingCacheService.invalidateCustomerGroup(id);

      logger.info(`Customer group deleted: ${group.name}`, {
        userId: (req as any).user?.id,
        groupId: id,
      });

      res.json({
        success: true,
        message: 'Customer group deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
