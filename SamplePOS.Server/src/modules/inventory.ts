import { Router } from 'express';
import prisma from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body, query } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';

const router = Router();

// Validation schemas
const adjustmentValidation = [
  body('productId').isString().withMessage('Product ID is required'),
  body('type').isIn(['IN', 'OUT', 'ADJUSTMENT']).withMessage('Invalid adjustment type'),
  body('quantity').isDecimal({ decimal_digits: '0,4' }).withMessage('Valid quantity required'),
  body('reason').trim().isLength({ min: 1 }).withMessage('Reason is required'),
  body('notes').optional().trim(),
];

const batchUpdateValidation = [
  body('quantity').optional().isDecimal({ decimal_digits: '0,4' }),
  body('unitCost').optional().isDecimal({ decimal_digits: '0,2' }),
  body('expiryDate').optional().isISO8601(),
  body('batchNumber').optional().trim(),
];

// GET /api/inventory/batches - List all stock batches
router.get(
  '/batches',
  authenticate,
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { productId, hasStock, expiringSoon } = req.query;

      // Build where clause
      const where: any = {};

      if (productId) {
        where.productId = productId;
      }

      if (hasStock === 'true') {
        where.quantity = { gt: 0 };
      } else if (hasStock === 'false') {
        where.quantity = { lte: 0 };
      }

      if (expiringSoon === 'true') {
        const thirtyDaysFromNow = new Date();
        thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
        where.expiryDate = {
          lte: thirtyDaysFromNow,
          gte: new Date(),
        };
      }

      // Get batches and total count
      const [batches, total] = await Promise.all([
        prisma.stockBatch.findMany({
          where,
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true,
                baseUnit: true,
              },
            },
            purchase: {
              select: {
                id: true,
                orderNumber: true,
                supplier: {
                  select: { id: true, name: true },
                },
              },
            },
          },
          orderBy: { purchaseDate: 'asc' }, // FIFO order
          skip,
          take: limit,
        }),
        prisma.stockBatch.count({ where }),
      ]);

      logger.info(`Listed ${batches.length} stock batches`, { userId: req.user?.id });

      res.json(buildPaginationResponse(batches, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/batches/:id - Get single batch
router.get(
  '/batches/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const batch = await prisma.stockBatch.findUnique({
        where: { id },
        include: {
          product: true,
          purchase: {
            include: {
              supplier: {
                select: { id: true, name: true, contactPerson: true },
              },
            },
          },
        },
      });

      if (!batch) {
        return res.status(404).json({ error: 'Stock batch not found' });
      }

      logger.info(`Retrieved batch: ${batch.batchNumber || batch.id}`, { userId: req.user?.id });

      res.json(batch);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/inventory/batches/:id - Update batch
router.put(
  '/batches/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  batchUpdateValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { quantity, unitCost, expiryDate, batchNumber } = req.body;

      const existingBatch = await prisma.stockBatch.findUnique({ where: { id } });
      if (!existingBatch) {
        return res.status(404).json({ error: 'Stock batch not found' });
      }

      const updateData: any = {};
      if (quantity !== undefined) updateData.quantity = new Prisma.Decimal(quantity);
      if (unitCost !== undefined) updateData.unitCost = new Prisma.Decimal(unitCost);
      if (expiryDate !== undefined) updateData.expiryDate = expiryDate ? new Date(expiryDate) : null;
      if (batchNumber !== undefined) updateData.batchNumber = batchNumber;

      const batch = await prisma.stockBatch.update({
        where: { id },
        data: updateData,
        include: {
          product: {
            select: { id: true, name: true, sku: true },
          },
        },
      });

      logger.info(`Updated batch: ${batch.batchNumber || batch.id}`, { userId: req.user?.id });

      res.json(batch);
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/inventory/batches/:id - Delete batch (Admin only, zero quantity only)
router.delete(
  '/batches/:id',
  authenticate,
  authorize(['ADMIN']),
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const batch = await prisma.stockBatch.findUnique({ where: { id } });
      if (!batch) {
        return res.status(404).json({ error: 'Stock batch not found' });
      }

      // Can only delete batches with zero quantity
      if (batch.quantity.gt(0)) {
        return res.status(400).json({
          error: 'Cannot delete batch with stock. Adjust quantity to zero first.',
        });
      }

      await prisma.stockBatch.delete({ where: { id } });

      logger.info(`Deleted batch: ${batch.batchNumber || batch.id}`, { userId: req.user?.id });

      res.json({ message: 'Batch deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/product/:productId - Get inventory for specific product
router.get(
  '/product/:productId',
  authenticate,
  async (req, res, next) => {
    try {
      const { productId } = req.params;

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      // Get all batches for this product
      const batches = await prisma.stockBatch.findMany({
        where: { productId },
        include: {
          purchase: {
            select: {
              id: true,
              orderNumber: true,
              supplier: { select: { name: true } },
            },
          },
        },
        orderBy: { purchaseDate: 'asc' }, // FIFO order
      });

      // Calculate totals
      const stats = await prisma.stockBatch.aggregate({
        where: { productId, quantity: { gt: 0 } },
        _sum: { quantity: true },
        _count: true,
      });

      // Calculate average cost (weighted)
      const totalValue = batches.reduce((sum, batch) => {
        const batchValue = batch.quantity.mul(batch.unitCost);
        return sum.add(batchValue);
      }, new Prisma.Decimal(0));

      const totalQuantity = stats._sum.quantity || new Prisma.Decimal(0);
      const averageCost = totalQuantity.gt(0)
        ? totalValue.div(totalQuantity)
        : new Prisma.Decimal(0);

      logger.info(`Retrieved inventory for product: ${product.name}`, { userId: req.user?.id });

      res.json({
        product: {
          id: product.id,
          name: product.name,
          sku: product.sku,
          baseUnit: product.baseUnit,
          reorderLevel: product.reorderLevel,
          reorderQuantity: product.reorderQuantity,
        },
        batches,
        summary: {
          totalBatches: batches.length,
          activeBatches: stats._count,
          totalQuantity,
          averageCost,
          totalValue,
          needsReorder: product.reorderLevel ? totalQuantity.lte(product.reorderLevel) : false,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/inventory/adjust - Make inventory adjustment
router.post(
  '/adjust',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  adjustmentValidation,
  validate,
  async (req, res, next) => {
    try {
      const { productId, type, quantity, reason, notes } = req.body;
      const userId = req.user!.id;

      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({ error: 'Product not found' });
      }

      const adjustmentQty = new Prisma.Decimal(quantity);

      if (adjustmentQty.lte(0)) {
        return res.status(400).json({ error: 'Quantity must be greater than zero' });
      }

      // Perform adjustment in transaction
      const result = await prisma.$transaction(async (tx) => {
        if (type === 'IN' || type === 'ADJUSTMENT') {
          // Add stock - create new batch
          const batch = await tx.stockBatch.create({
            data: {
              productId,
              quantity: adjustmentQty,
              unitCost: product.costPrice || new Prisma.Decimal(0),
              purchaseDate: new Date(),
              batchNumber: `ADJ-${Date.now()}`,
              expiryDate: null,
              purchaseId: null,
            },
          });

          return {
            type: 'IN',
            quantity: adjustmentQty,
            batch,
          };
        } else {
          // Remove stock (OUT) - use FIFO
          const batches = await tx.stockBatch.findMany({
            where: {
              productId,
              quantity: { gt: 0 },
            },
            orderBy: { purchaseDate: 'asc' }, // FIFO
          });

          const totalAvailable = batches.reduce(
            (sum, b) => sum.add(b.quantity),
            new Prisma.Decimal(0)
          );

          if (totalAvailable.lt(adjustmentQty)) {
            throw new Error(
              `Insufficient stock. Available: ${totalAvailable}, Required: ${adjustmentQty}`
            );
          }

          // Deduct from batches (FIFO)
          let remaining = adjustmentQty;
          const updatedBatches = [];

          for (const batch of batches) {
            if (remaining.lte(0)) break;

            const deduct = remaining.lte(batch.quantity) ? remaining : batch.quantity;
            const newQuantity = batch.quantity.minus(deduct);

            await tx.stockBatch.update({
              where: { id: batch.id },
              data: { quantity: newQuantity },
            });

            updatedBatches.push({
              id: batch.id,
              deducted: deduct,
              newQuantity,
            });

            remaining = remaining.minus(deduct);
          }

          return {
            type: 'OUT',
            quantity: adjustmentQty,
            batchesUpdated: updatedBatches,
          };
        }
      });

      logger.info(
        `Inventory adjustment: ${type} ${adjustmentQty} for product ${product.name}`,
        { userId, reason }
      );

      res.status(201).json({
        message: 'Inventory adjustment successful',
        adjustment: {
          productId,
          productName: product.name,
          type,
          quantity: adjustmentQty,
          reason,
          notes,
          ...result,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/expiring - Get expiring stock batches
router.get(
  '/alerts/expiring',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { days = 30 } = req.query;

      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + Number(days));

      const expiringBatches = await prisma.stockBatch.findMany({
        where: {
          quantity: { gt: 0 },
          expiryDate: {
            lte: targetDate,
            gte: new Date(),
          },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              baseUnit: true,
            },
          },
          purchase: {
            select: {
              orderNumber: true,
              supplier: { select: { name: true } },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      // Calculate total value at risk
      const totalValue = expiringBatches.reduce((sum, batch) => {
        return sum.add(batch.quantity.mul(batch.unitCost));
      }, new Prisma.Decimal(0));

      logger.info(`Found ${expiringBatches.length} expiring batches`, { userId: req.user?.id });

      res.json({
        batches: expiringBatches,
        summary: {
          totalBatches: expiringBatches.length,
          totalValue,
          daysAhead: Number(days),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/expired - Get expired stock batches
router.get(
  '/alerts/expired',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const expiredBatches = await prisma.stockBatch.findMany({
        where: {
          quantity: { gt: 0 },
          expiryDate: {
            lt: new Date(),
          },
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              baseUnit: true,
            },
          },
          purchase: {
            select: {
              orderNumber: true,
              supplier: { select: { name: true } },
            },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      // Calculate total loss value
      const totalValue = expiredBatches.reduce((sum, batch) => {
        return sum.add(batch.quantity.mul(batch.unitCost));
      }, new Prisma.Decimal(0));

      logger.info(`Found ${expiredBatches.length} expired batches`, { userId: req.user?.id });

      res.json({
        batches: expiredBatches,
        summary: {
          totalBatches: expiredBatches.length,
          totalValue,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/valuation - Get total inventory valuation
router.get(
  '/reports/valuation',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      // Get all active batches
      const batches = await prisma.stockBatch.findMany({
        where: { quantity: { gt: 0 } },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              category: true,
            },
          },
        },
      });

      // Calculate valuation
      const productValuation = new Map<string, any>();

      batches.forEach((batch) => {
        const productId = batch.productId;
        const batchValue = batch.quantity.mul(batch.unitCost);

        if (productValuation.has(productId)) {
          const current = productValuation.get(productId);
          current.quantity = current.quantity.add(batch.quantity);
          current.value = current.value.add(batchValue);
          current.batches++;
        } else {
          productValuation.set(productId, {
            product: batch.product,
            quantity: batch.quantity,
            value: batchValue,
            batches: 1,
          });
        }
      });

      // Convert to array and calculate averages
      const valuationArray = Array.from(productValuation.values()).map((item) => ({
        ...item,
        averageCost: item.quantity.gt(0) ? item.value.div(item.quantity) : new Prisma.Decimal(0),
      }));

      // Sort by value descending
      valuationArray.sort((a, b) => b.value.comparedTo(a.value));

      // Calculate totals
      const totalValue = valuationArray.reduce(
        (sum, item) => sum.add(item.value),
        new Prisma.Decimal(0)
      );

      const totalQuantity = valuationArray.reduce(
        (sum, item) => sum.add(item.quantity),
        new Prisma.Decimal(0)
      );

      logger.info('Generated inventory valuation report', { userId: req.user?.id });

      res.json({
        items: valuationArray,
        summary: {
          totalProducts: valuationArray.length,
          totalBatches: batches.length,
          totalValue,
          totalQuantity,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/inventory/stats/overview - Inventory overview statistics
router.get(
  '/stats/overview',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const [totalBatches, activeBatches, totalValue, lowStockCount, expiringCount] =
        await Promise.all([
          prisma.stockBatch.count(),
          prisma.stockBatch.count({ where: { quantity: { gt: 0 } } }),
          prisma.stockBatch.findMany({
            where: { quantity: { gt: 0 } },
            select: { quantity: true, unitCost: true },
          }),
          // Low stock products
          prisma.product.count({
            where: { reorderLevel: { gt: 0 } },
          }),
          // Expiring in 30 days
          prisma.stockBatch.count({
            where: {
              quantity: { gt: 0 },
              expiryDate: {
                lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                gte: new Date(),
              },
            },
          }),
        ]);

      // Calculate total inventory value
      const inventoryValue = totalValue.reduce((sum, batch) => {
        return sum.add(new Prisma.Decimal(batch.quantity).mul(batch.unitCost));
      }, new Prisma.Decimal(0));

      const stats = {
        totalBatches,
        activeBatches,
        inventoryValue,
        lowStockCount,
        expiringCount,
      };

      logger.info('Retrieved inventory statistics', { userId: req.user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
