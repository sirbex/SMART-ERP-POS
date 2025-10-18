import { Router } from 'express';
import prisma from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse, generateDocumentNumber } from '../utils/helpers.js';

const router = Router();

// Validation schemas
const createPurchaseValidation = [
  body('supplierId').isString().withMessage('Supplier ID is required'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isString().withMessage('Product ID is required'),
  body('items.*.quantity').isDecimal({ decimal_digits: '0,4' }).withMessage('Valid quantity required'),
  body('items.*.unitCost').isDecimal({ decimal_digits: '0,2' }).withMessage('Valid unit cost required'),
  body('items.*.expiryDate').optional().isISO8601(),
  body('items.*.batchNumber').optional().isString(),
  body('orderDate').optional().isISO8601(),
  body('expectedDate').optional().isISO8601(),
  body('discount').optional().isDecimal({ decimal_digits: '0,2' }),
  body('shippingCost').optional().isDecimal({ decimal_digits: '0,2' }),
  body('notes').optional().isString(),
];

const updatePurchaseValidation = [
  body('status').optional().isIn(['PENDING', 'ORDERED', 'RECEIVED', 'CANCELLED']),
  body('expectedDate').optional().isISO8601(),
  body('receivedDate').optional().isISO8601(),
  body('notes').optional().isString(),
];

const receivePurchaseValidation = [
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.id').isString().withMessage('Item ID is required'),
  body('items.*.receivedQuantity').isDecimal({ decimal_digits: '0,4' }).withMessage('Valid quantity required'),
  body('receivedDate').optional().isISO8601(),
  body('notes').optional().isString(),
];

// GET /api/purchases - List all purchases
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, supplierId, status, startDate, endDate } = req.query;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { orderNumber: { contains: search as string, mode: 'insensitive' } },
          { supplier: { name: { contains: search as string, mode: 'insensitive' } } },
        ];
      }

      if (supplierId) {
        where.supplierId = supplierId;
      }

      if (status) {
        where.status = status;
      }

      if (startDate || endDate) {
        where.orderDate = {};
        if (startDate) where.orderDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.orderDate.lte = end;
        }
      }

      // Get purchases and total count
      const [purchases, total] = await Promise.all([
        prisma.purchase.findMany({
          where,
          include: {
            supplier: {
              select: { id: true, name: true, contactPerson: true, phone: true },
            },
            items: {
              include: {
                product: {
                  select: { id: true, name: true, sku: true, baseUnit: true },
                },
              },
            },
            _count: {
              select: { items: true },
            },
          },
          orderBy: { orderDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.purchase.count({ where }),
      ]);

      logger.info(`Listed ${purchases.length} purchases`, { userId: req.user?.id });

      res.json(buildPaginationResponse(purchases, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/:id - Get single purchase
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
          supplier: true,
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  barcode: true,
                  baseUnit: true,
                },
              },
            },
          },
        },
      });

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      logger.info(`Retrieved purchase: ${purchase.orderNumber}`, { userId: req.user?.id });

      res.json(purchase);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/purchases - Create new purchase order
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  createPurchaseValidation,
  validate,
  async (req, res, next) => {
    try {
      const { supplierId, items, orderDate, expectedDate, discount, shippingCost, notes } = req.body;

      // Validate supplier
      const supplier = await prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      // Validate products and calculate totals
      const processedItems = [];
      let subtotal = new Prisma.Decimal(0);

      for (const item of items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId } });
        if (!product) {
          return res.status(404).json({ error: `Product not found: ${item.productId}` });
        }

        const quantity = new Prisma.Decimal(item.quantity);
        const unitCost = new Prisma.Decimal(item.unitCost);
        const lineTotal = quantity.mul(unitCost);

        processedItems.push({
          productId: product.id,
          quantity,
          unitCost,
          lineTotal,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
          batchNumber: item.batchNumber || null,
        });

        subtotal = subtotal.add(lineTotal);
      }

      // Calculate total
      const purchaseDiscount = discount ? new Prisma.Decimal(discount) : new Prisma.Decimal(0);
      const shipping = shippingCost ? new Prisma.Decimal(shippingCost) : new Prisma.Decimal(0);
      const totalAmount = subtotal.minus(purchaseDiscount).add(shipping);

      // Generate order number
      const orderNumber = await generateDocumentNumber('PO');

      // Create purchase order
      const purchase = await prisma.purchase.create({
        data: {
          orderNumber,
          supplierId,
          orderDate: orderDate ? new Date(orderDate) : new Date(),
          expectedDate: expectedDate ? new Date(expectedDate) : null,
          subtotal,
          discount: purchaseDiscount,
          shippingCost: shipping,
          totalAmount,
          status: 'PENDING',
          notes,
          items: {
            create: processedItems,
          },
        },
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
        },
      });

      logger.info(`Created purchase order: ${purchase.orderNumber}`, { userId: req.user?.id });

      res.status(201).json(purchase);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/purchases/:id - Update purchase order
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  updatePurchaseValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, expectedDate, receivedDate, notes } = req.body;

      const existingPurchase = await prisma.purchase.findUnique({ where: { id } });
      if (!existingPurchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      // Cannot modify received or cancelled purchases
      if (existingPurchase.status === 'RECEIVED' || existingPurchase.status === 'CANCELLED') {
        return res.status(400).json({
          error: 'Cannot modify received or cancelled purchase orders',
        });
      }

      const updateData: any = {};
      if (status) updateData.status = status;
      if (expectedDate) updateData.expectedDate = new Date(expectedDate);
      if (receivedDate) updateData.receivedDate = new Date(receivedDate);
      if (notes !== undefined) updateData.notes = notes;

      const purchase = await prisma.purchase.update({
        where: { id },
        data: updateData,
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
        },
      });

      logger.info(`Updated purchase order: ${purchase.orderNumber}`, { userId: req.user?.id });

      res.json(purchase);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/purchases/:id/receive - Receive purchase order and create stock batches
router.post(
  '/:id/receive',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  receivePurchaseValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { items, receivedDate, notes } = req.body;

      const purchase = await prisma.purchase.findUnique({
        where: { id },
        include: { items: true },
      });

      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      if (purchase.status === 'RECEIVED') {
        return res.status(400).json({ error: 'Purchase order already received' });
      }

      if (purchase.status === 'CANCELLED') {
        return res.status(400).json({ error: 'Cannot receive cancelled purchase order' });
      }

      // Validate received items
      const receivedItems = new Map();
      for (const item of items) {
        const purchaseItem = purchase.items.find((pi) => pi.id === item.id);
        if (!purchaseItem) {
          return res.status(404).json({ error: `Purchase item not found: ${item.id}` });
        }

        const receivedQty = new Prisma.Decimal(item.receivedQuantity);
        if (receivedQty.gt(purchaseItem.quantity)) {
          return res.status(400).json({
            error: `Received quantity (${receivedQty}) exceeds ordered quantity (${purchaseItem.quantity})`,
          });
        }

        receivedItems.set(item.id, receivedQty);
      }

      // Receive purchase and create stock batches
      const receivedPurchase = await prisma.$transaction(async (tx) => {
        // Update purchase status
        const updated = await tx.purchase.update({
          where: { id },
          data: {
            status: 'RECEIVED',
            receivedDate: receivedDate ? new Date(receivedDate) : new Date(),
            notes: notes ? `${purchase.notes || ''}\n${notes}` : purchase.notes,
          },
        });

        // Create stock batches for received items
        for (const purchaseItem of purchase.items) {
          const receivedQty = receivedItems.get(purchaseItem.id);
          if (receivedQty && receivedQty.gt(0)) {
            await tx.stockBatch.create({
              data: {
                productId: purchaseItem.productId,
                purchaseId: purchase.id,
                quantity: receivedQty,
                unitCost: purchaseItem.unitCost,
                purchaseDate: updated.receivedDate!,
                expiryDate: purchaseItem.expiryDate,
                batchNumber: purchaseItem.batchNumber,
              },
            });

            // Update product cost price (optional - use latest purchase cost)
            await tx.product.update({
              where: { id: purchaseItem.productId },
              data: { costPrice: purchaseItem.unitCost },
            });
          }
        }

        return updated;
      });

      logger.info(`Received purchase order: ${purchase.orderNumber}`, {
        userId: req.user?.id,
        totalItems: items.length,
      });

      // Return full purchase details
      const fullPurchase = await prisma.purchase.findUnique({
        where: { id },
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
        },
      });

      res.json(fullPurchase);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/purchases/:id/cancel - Cancel purchase order
router.post(
  '/:id/cancel',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const purchase = await prisma.purchase.findUnique({ where: { id } });
      if (!purchase) {
        return res.status(404).json({ error: 'Purchase not found' });
      }

      if (purchase.status === 'RECEIVED') {
        return res.status(400).json({ error: 'Cannot cancel received purchase order' });
      }

      if (purchase.status === 'CANCELLED') {
        return res.status(400).json({ error: 'Purchase order already cancelled' });
      }

      const cancelledPurchase = await prisma.purchase.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          notes: `${purchase.notes || ''}\n[CANCELLED] ${reason || 'No reason provided'}`,
        },
        include: {
          supplier: true,
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
        },
      });

      logger.info(`Cancelled purchase order: ${purchase.orderNumber}`, {
        userId: req.user?.id,
        reason,
      });

      res.json(cancelledPurchase);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/stats/summary - Purchase statistics
router.get(
  '/stats/summary',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;

      const where: any = {};

      if (startDate || endDate) {
        where.orderDate = {};
        if (startDate) where.orderDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.orderDate.lte = end;
        }
      }

      const [totalPurchases, byStatus, totalValue] = await Promise.all([
        prisma.purchase.count({ where }),
        prisma.purchase.groupBy({
          by: ['status'],
          where,
          _count: true,
        }),
        prisma.purchase.aggregate({
          where: { ...where, status: 'RECEIVED' },
          _sum: { totalAmount: true },
        }),
      ]);

      const stats = {
        totalPurchases,
        byStatus: byStatus.reduce((acc, { status, _count }) => {
          acc[status] = _count;
          return acc;
        }, {} as Record<string, number>),
        totalValue: totalValue._sum.totalAmount || new Prisma.Decimal(0),
      };

      logger.info('Retrieved purchase statistics', { userId: req.user?.id });

      res.json(stats);
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/purchases/pending - Get pending purchase orders
router.get(
  '/reports/pending',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const pendingPurchases = await prisma.purchase.findMany({
        where: {
          status: { in: ['PENDING', 'ORDERED'] },
        },
        include: {
          supplier: {
            select: { id: true, name: true, contactPerson: true, phone: true },
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, sku: true },
              },
            },
          },
        },
        orderBy: { expectedDate: 'asc' },
      });

      logger.info(`Retrieved ${pendingPurchases.length} pending purchases`, {
        userId: req.user?.id,
      });

      res.json(pendingPurchases);
    } catch (error) {
      next(error);
    }
  }
);

export default router;
