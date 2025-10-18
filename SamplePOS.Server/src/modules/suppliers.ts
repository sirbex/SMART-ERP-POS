import { Router } from 'express';
import prisma from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

const router = Router();

// Validation schemas
const createSupplierValidation = [
  body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Supplier name is required'),
  body('contactPerson').optional().trim().isLength({ max: 100 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('address').optional().trim(),
  body('taxId').optional().trim().isLength({ max: 100 }),
  body('paymentTerms').optional().trim(),
  body('notes').optional().trim(),
];

const updateSupplierValidation = [
  body('name').optional().trim().isLength({ min: 1, max: 200 }),
  body('contactPerson').optional().trim().isLength({ max: 100 }),
  body('phone').optional().trim().isLength({ max: 50 }),
  body('email').optional().isEmail().normalizeEmail(),
  body('address').optional().trim(),
  body('taxId').optional().trim().isLength({ max: 100 }),
  body('paymentTerms').optional().trim(),
  body('notes').optional().trim(),
];

// GET /api/suppliers - List all suppliers
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search } = req.query;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { contactPerson: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
          { taxId: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Get suppliers and total count
      const [suppliers, total] = await Promise.all([
        prisma.supplier.findMany({
          where,
          include: {
            _count: {
              select: { purchases: true },
            },
          },
          orderBy: { name: 'asc' },
          skip,
          take: limit,
        }),
        prisma.supplier.count({ where }),
      ]);

      logger.info(`Listed ${suppliers.length} suppliers`, { userId: req.user?.id });

      res.json(buildPaginationResponse(suppliers, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/suppliers/:id - Get single supplier with purchase history
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
          purchases: {
            orderBy: { orderDate: 'desc' },
            take: 10,
            include: {
              items: {
                include: {
                  product: {
                    select: { id: true, name: true, sku: true },
                  },
                },
              },
            },
          },
          _count: {
            select: { purchases: true },
          },
        },
      });

      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      // Calculate total purchases
      const stats = await prisma.purchase.aggregate({
        where: { supplierId: id, status: 'RECEIVED' },
        _sum: { totalAmount: true },
        _count: true,
      });

      logger.info(`Retrieved supplier: ${supplier.name}`, { userId: req.user?.id });

      res.json({
        ...supplier,
        totalPurchases: stats._count,
        totalPurchaseAmount: stats._sum.totalAmount || new Prisma.Decimal(0),
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/suppliers - Create new supplier
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  createSupplierValidation,
  validate,
  async (req, res, next) => {
    try {
      const { name, contactPerson, phone, email, address, taxId, paymentTerms, notes } = req.body;

      // Check for duplicate phone or email
      if (phone || email) {
        const duplicate = await prisma.supplier.findFirst({
          where: {
            OR: [
              ...(phone ? [{ phone }] : []),
              ...(email ? [{ email }] : []),
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.phone === phone
              ? 'Phone number already exists'
              : 'Email already exists',
          });
        }
      }

      // Create supplier
      const supplier = await prisma.supplier.create({
        data: {
          name,
          contactPerson,
          phone,
          email,
          address,
          taxId,
          paymentTerms,
          notes,
        },
      });

      logger.info(`Created supplier: ${supplier.name}`, { userId: req.user?.id });

      res.status(201).json(supplier);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/suppliers/:id - Update supplier
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  updateSupplierValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Check if supplier exists
      const existingSupplier = await prisma.supplier.findUnique({ where: { id } });
      if (!existingSupplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      // Check for duplicate phone or email
      if (updateData.phone || updateData.email) {
        const duplicate = await prisma.supplier.findFirst({
          where: {
            AND: [
              { id: { not: id } },
              {
                OR: [
                  ...(updateData.phone ? [{ phone: updateData.phone }] : []),
                  ...(updateData.email ? [{ email: updateData.email }] : []),
                ],
              },
            ],
          },
        });

        if (duplicate) {
          return res.status(400).json({
            error: duplicate.phone === updateData.phone
              ? 'Phone number already exists'
              : 'Email already exists',
          });
        }
      }

      // Update supplier
      const supplier = await prisma.supplier.update({
        where: { id },
        data: updateData,
      });

      logger.info(`Updated supplier: ${supplier.name}`, { userId: req.user?.id });

      res.json(supplier);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/suppliers/:id - Delete supplier
router.delete(
  '/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const supplier = await prisma.supplier.findUnique({
        where: { id },
        include: {
          _count: { select: { purchases: true } },
        },
      });

      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      // Cannot delete supplier with purchase history
      if (supplier._count.purchases > 0) {
        return res.status(400).json({
          error: 'Cannot delete supplier with purchase history',
        });
      }

      await prisma.supplier.delete({ where: { id } });

      logger.info(`Deleted supplier: ${supplier.name}`, { userId: req.user?.id });

      res.json({ message: 'Supplier deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/suppliers/stats/overview - Supplier statistics
router.get(
  '/stats/overview',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const [totalSuppliers, activePurchases, recentSuppliers] = await Promise.all([
        prisma.supplier.count(),
        prisma.purchase.count({
          where: { status: { in: ['PENDING', 'ORDERED'] } },
        }),
        prisma.supplier.count({
          where: {
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        }),
      ]);

      const stats = {
        totalSuppliers,
        activePurchases,
        newSuppliersLast30Days: recentSuppliers,
      };

      logger.info('Retrieved supplier statistics', { userId: req.user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/suppliers/top-suppliers - Get top suppliers by purchase volume
router.get(
  '/reports/top-suppliers',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { limit = 10 } = req.query;

      const topSuppliers = await prisma.supplier.findMany({
        include: {
          purchases: {
            where: { status: 'RECEIVED' },
            select: { totalAmount: true },
          },
        },
      });

      // Calculate total purchase amount for each supplier
      const suppliersWithTotals = topSuppliers
        .map((supplier) => {
          const total = supplier.purchases.reduce(
            (sum, purchase) => sum.add(purchase.totalAmount),
            new Prisma.Decimal(0)
          );
          return {
            id: supplier.id,
            name: supplier.name,
            contactPerson: supplier.contactPerson,
            phone: supplier.phone,
            email: supplier.email,
            totalPurchaseAmount: total,
            purchaseCount: supplier.purchases.length,
          };
        })
        .sort((a, b) => b.totalPurchaseAmount.comparedTo(a.totalPurchaseAmount))
        .slice(0, Number(limit));

      logger.info('Retrieved top suppliers', { userId: req.user?.id });

      res.json(suppliersWithTotals);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
