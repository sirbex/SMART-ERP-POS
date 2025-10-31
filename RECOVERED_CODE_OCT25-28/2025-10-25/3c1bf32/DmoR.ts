import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse } from '../utils/helpers.js';
import * as inventoryService from '../services/inventoryService.js';

const router = Router();

// GET /api/inventory/items/:id/check-stock - Check stock availability for POS
router.get(
  '/items/:id/check-stock',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { quantity } = req.query;

      // Get product with current stock
      const product = await prisma.product.findUnique({
        where: { id },
        select: { id: true, name: true, currentStock: true, reorderLevel: true, trackInventory: true, allowNegativeStock: true }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          available: 0,
          message: 'Product not found'
        });
      }

      const requestedQty = typeof quantity === 'string' ? parseFloat(quantity) : Number(quantity) || 0;

      // Prefer batch-based availability (more accurate with FIFO), fallback to product.currentStock
      const batchAgg = await prisma.stockBatch.aggregate({
        where: { productId: id, quantityRemaining: { gt: 0 } },
        _sum: { quantityRemaining: true }
      });

      const availableFromBatches = batchAgg._sum.quantityRemaining
        ? Number(batchAgg._sum.quantityRemaining.toString())
        : 0;

      const availableFromProduct = product.currentStock
        ? Number((product.currentStock as any).toString?.() ?? product.currentStock)
        : 0;

      const available = Math.max(availableFromBatches, availableFromProduct);
      const sufficient = product.allowNegativeStock ? true : available >= requestedQty;

      res.json({
        success: sufficient,
        available: available,
        message: sufficient 
          ? `${available} units available` 
          : `Insufficient stock. Only ${available} units available`
      });
    } catch (error) {
      next(error);
    }
  }
);

// Validation schemas
// GET /api/inventory/batches - List all stock batches
router.get(
  '/batches',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { productId, hasStock, expiringSoon } = req.query;

      // Build where clause
      const where: any = {};

      if (productId) {
        where.productId = productId;
      }

      if (hasStock === 'true') {
        where.quantityRemaining = { gt: 0 };
      } else if (hasStock === 'false') {
        where.quantityRemaining = { lte: 0 };
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
      const batches = await 
        prisma.stockBatch.findMany({
          where,
          include: {
            product: { select: { id: true, name: true, barcode: true, baseUnit: true } } }, orderBy: { expiryDate: 'asc' },
      });

      // Calculate total value at risk
      const totalValue = batches.reduce((sum: Prisma.Decimal, batch: any) => {
        return sum.add(batch.quantityRemaining.mul(batch.unitCost));
      }, new Prisma.Decimal(0));

      logger.info(`Found ${batches.length} expiring batches`, { userId: (req as any).user?.id });

      res.json({
        batches: batches,
        summary: {
          totalBatches: batches.length,
          totalValue,
          daysAhead: 30,
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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const expiredBatches = await prisma.stockBatch.findMany({
        where: {
          quantityRemaining: { gt: 0 },
          expiryDate: {
            lt: new Date(),
          },
        },
        include: {
          product: { select: { id: true, name: true, barcode: true, baseUnit: true } } }, orderBy: { expiryDate: 'asc' },
      });

      // Calculate total loss value
      const totalValue = expiredBatches.reduce((sum: Prisma.Decimal, batch: any) => {
        return sum.add(batch.quantityRemaining.mul(batch.unitCost));
      }, new Prisma.Decimal(0));

      logger.info(`Found ${expiredBatches.length} expired batches`, { userId: (req as any).user?.id });

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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Get all active batches
      const batches = await prisma.stockBatch.findMany({
        where: { quantityRemaining: { gt: 0 } },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              barcode: true,
              category: true,
            },
          },
        },
      });

      // Calculate valuation
      const productValuation = new Map<string, any>();

      batches.forEach((batch: any) => {
        const productId = batch.productId;
        const batchValue = batch.quantityRemaining.mul(batch.unitCost);

        if (productValuation.has(productId)) {
          const current = productValuation.get(productId);
          current.quantityRemaining = current.quantityRemaining.add(batch.quantityRemaining);
          current.value = current.value.add(batchValue);
          current.batches++;
        } else {
          productValuation.set(productId, {
            product: batch.product,
            quantityRemaining: batch.quantityRemaining,
            value: batchValue,
            batches: 1,
          });
        }
      });

      // Convert to array and calculate averages
      const valuationArray = Array.from(productValuation.values()).map((item) => ({
        ...item,
        averageCost: item.quantityRemaining.gt(0) ? item.value.div(item.quantityRemaining) : new Prisma.Decimal(0),
      }));

      // Sort by value descending
      valuationArray.sort((a, b) => b.value.comparedTo(a.value));

      // Calculate totals
      const totalValue = valuationArray.reduce(
        (sum, item) => sum.add(item.value),
        new Prisma.Decimal(0)
      );

      const totalQuantity = valuationArray.reduce(
        (sum, item) => sum.add(item.quantityRemaining),
        new Prisma.Decimal(0)
      );

      logger.info('Generated inventory valuation report', { userId: (req as any).user?.id });

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
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const [totalBatches, activeBatches, totalValue, lowStockCount, expiringCount] =
        await Promise.all([
          prisma.stockBatch.count(),
          prisma.stockBatch.count({ where: { quantityRemaining: { gt: 0 } } }),
          prisma.stockBatch.findMany({
            where: { quantityRemaining: { gt: 0 } },
            select: { quantityRemaining: true, unitCost: true },
          }),
          // Low stock products
          prisma.product.count({
            where: { reorderLevel: { gt: 0 } },
          }),
          // Expiring in 30 days
          prisma.stockBatch.count({
            where: {
              quantityRemaining: { gt: 0 },
              expiryDate: {
                lte: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                gte: new Date(),
              },
            },
          }),
        ]);

        

      // Calculate total inventory value
      const inventoryValue = totalValue.reduce((sum: Prisma.Decimal, batch: any) => {
        return sum.add(new Prisma.Decimal(batch.quantityRemaining).mul(batch.unitCost));
      }, new Prisma.Decimal(0));

      const stats = {
        totalBatches,
        activeBatches,
        inventoryValue,
        lowStockCount,
        expiringCount,
      };

      logger.info('Retrieved inventory statistics', { userId: (req as any).user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/inventory/adjust - Receive inventory
router.post(
  '/adjust',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId, quantity, costPrice, batchNumber, expiryDate, purchaseDate } = req.body;

      // Validate required fields
      if (!productId || !quantity || !costPrice || !batchNumber) {
        return res.status(400).json({
          error: 'Missing required fields: productId, quantity, costPrice, batchNumber',
        });
      }

      const user = (req as any).user;

      // Call inventory service to receive inventory
      const result = await inventoryService.receiveInventory({
        productId,
        quantity: Number(quantity),
        unitCost: Number(costPrice),
        batchNumber,
        expiryDate: expiryDate ? new Date(expiryDate) : undefined,
        receivedDate: purchaseDate ? new Date(purchaseDate) : new Date(),
        userId: user?.id || 0,
      });

      logger.info(`Received ${quantity} units of product ${productId}`, {
        userId: user?.id,
        batchNumber,
        batchId: result.batch.id,
      });

      res.json({
        success: true,
        message: 'Inventory received successfully',
        data: result.batch
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;












