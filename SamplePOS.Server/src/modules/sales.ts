import { Router } from 'express';
import prisma from '@prisma/client';
import prisma from '../config/database.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { validate } from '../middleware/validation.js';
import { body, query } from 'express-validator';
import logger from '../utils/logger.js';
import { parsePagination, buildPaginationResponse, generateDocumentNumber, parseFilters } from '../utils/helpers.js';
import { calculateFIFO, createBatchUpdates } from '../utils/fifoCalculator.js';
import { convertToBaseUnit } from '../utils/uomConverter.js';

const router = Router();

// Validation schemas
const createSaleValidation = [
  body('customerId').optional().isString(),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.productId').isString().withMessage('Product ID is required'),
  body('items.*.quantity').isDecimal({ decimal_digits: '0,4' }).withMessage('Valid quantity required'),
  body('items.*.unit').optional().isString(),
  body('items.*.unitPrice').optional().isDecimal({ decimal_digits: '0,2' }),
  body('items.*.discount').optional().isDecimal({ decimal_digits: '0,2' }),
  body('payments').isArray({ min: 1 }).withMessage('At least one payment is required'),
  body('payments.*.method').isIn(['CASH', 'CARD', 'MOBILE_MONEY', 'CREDIT', 'BANK_TRANSFER']),
  body('payments.*.amount').isDecimal({ decimal_digits: '0,2' }).withMessage('Valid amount required'),
  body('payments.*.reference').optional().isString(),
  body('discount').optional().isDecimal({ decimal_digits: '0,2' }),
  body('notes').optional().isString(),
];

const updateSaleValidation = [
  body('status').optional().isIn(['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
  body('notes').optional().isString(),
];

// GET /api/sales - List all sales with pagination and filters
router.get(
  '/',
  authenticate,
  async (req, res, next) => {
    try {
      const { page, limit, skip } = parsePagination(req.query);
      const { search, customerId, status, startDate, endDate, cashierId } = req.query;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          { invoiceNumber: { contains: search as string, mode: 'insensitive' } },
          { customer: { name: { contains: search as string, mode: 'insensitive' } } },
        ];
      }

      if (customerId) {
        where.customerId = customerId;
      }

      if (status) {
        where.status = status;
      }

      if (cashierId) {
        where.cashierId = cashierId;
      }

      if (startDate || endDate) {
        where.saleDate = {};
        if (startDate) where.saleDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.saleDate.lte = end;
        }
      }

      // Get sales and total count
      const [sales, total] = await Promise.all([
        prisma.sale.findMany({
          where,
          include: {
            customer: {
              select: { id: true, name: true, phone: true },
            },
            createdBy: {
              select: { id: true, username: true, fullName: true },
            },
            items: {
              include: {
                product: {
                  select: { id: true, name: true, barcode: true, baseUnit: true },
                },
              },
            },
            payments: true,
            _count: {
              select: { items: true, payments: true },
            },
          },
          orderBy: { saleDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.sale.count({ where }),
      ]);

      logger.info(`Listed ${sales.length} sales`, { userId: req.user?.id });

      res.json(buildPaginationResponse(sales, total, page, limit));
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/:id - Get single sale with full details
router.get(
  '/:id',
  authenticate,
  async (req, res, next) => {
    try {
      const { id } = req.params;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          customer: true,
          cashier: {
            select: { id: true, username: true, fullName: true, role: true },
          },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  sku: true,
                  barcode: true,
                  baseUnit: true,
                  alternateUnits: true,
                },
              },
            },
          },
          payments: true,
        },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      logger.info(`Retrieved sale: ${sale.invoiceNumber}`, { userId: req.user?.id });

      res.json(sale);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sales - Create new sale (POS transaction)
router.post(
  '/',
  authenticate,
  createSaleValidation,
  validate,
  async (req, res, next) => {
    try {
      const { customerId, items, payments, discount, notes } = req.body;
      const cashierId = req.user!.id;

      // Validate customer if provided
      if (customerId) {
        const customer = await prisma.customer.findUnique({ where: { id: customerId } });
        if (!customer) {
          return res.status(404).json({ error: 'Customer not found' });
        }
      }

      // Process sale items and calculate totals
      const processedItems = [];
      let subtotal = new Prisma.Decimal(0);

      for (const item of items) {
        const product = await prisma.product.findUnique({
          where: { id: item.productId },
          include: {
            batches: {
              where: { quantity: { gt: 0 } },
              orderBy: { purchaseDate: 'asc' }, // FIFO
            },
          },
        });

        if (!product) {
          return res.status(404).json({ error: `Product not found: ${item.productId}` });
        }

        if (!product.isActive) {
          return res.status(400).json({ error: `Product is inactive: ${product.name}` });
        }

        // Convert quantity to base unit
        const unit = item.unit || product.baseUnit;
        const quantityInBaseUnit = convertToBaseUnit(
          parseFloat(item.quantity),
          unit,
          product.baseUnit,
          product.alternateUnits as any[]
        );

        // Check stock availability
        const totalStock = await prisma.stockBatch.aggregate({
          where: { productId: product.id, quantity: { gt: 0 } },
          _sum: { quantity: true },
        });

        const availableStock = totalStock._sum.quantity || new Prisma.Decimal(0);

        if (product.trackInventory && !product.allowNegativeStock) {
          if (availableStock.lt(quantityInBaseUnit)) {
            return res.status(400).json({
              error: `Insufficient stock for ${product.name}. Available: ${availableStock}, Required: ${quantityInBaseUnit}`,
            });
          }
        }

        // Calculate FIFO cost
        const fifoResult = calculateFIFO(product.batches, new Prisma.Decimal(quantityInBaseUnit));
        const unitCost = fifoResult.totalCost.div(quantityInBaseUnit);

        // Use provided unit price or default to product selling price
        const unitPrice = item.unitPrice
          ? new Prisma.Decimal(item.unitPrice)
          : product.sellingPrice;

        const itemDiscount = item.discount ? new Prisma.Decimal(item.discount) : new Prisma.Decimal(0);
        const lineTotal = unitPrice.mul(item.quantity).minus(itemDiscount);

        processedItems.push({
          product,
          productId: product.id,
          quantity: new Prisma.Decimal(item.quantity),
          unit,
          quantityInBaseUnit: new Prisma.Decimal(quantityInBaseUnit),
          unitPrice,
          unitCost,
          discount: itemDiscount,
          lineTotal,
          fifoResult,
        });

        subtotal = subtotal.add(lineTotal);
      }

      // Calculate totals
      const saleDiscount = discount ? new Prisma.Decimal(discount) : new Prisma.Decimal(0);
      const totalBeforeTax = subtotal.minus(saleDiscount);

      // Calculate tax (using weighted average of product tax rates)
      let totalTax = new Prisma.Decimal(0);
      for (const item of processedItems) {
        const taxableAmount = item.lineTotal;
        const tax = taxableAmount.mul(item.product.taxRate).div(100);
        totalTax = totalTax.add(tax);
      }

      const totalAmount = totalBeforeTax.add(totalTax);

      // Validate payments
      const totalPaid = payments.reduce(
        (sum: Prisma.Decimal, p: any) => sum.add(new Prisma.Decimal(p.amount)),
        new Prisma.Decimal(0)
      );

      if (totalPaid.lt(totalAmount)) {
        return res.status(400).json({
          error: `Insufficient payment. Total: ${totalAmount}, Paid: ${totalPaid}`,
        });
      }

      // Check for credit payment
      const hasCreditPayment = payments.some((p: any) => p.method === 'CREDIT');
      if (hasCreditPayment && !customerId) {
        return res.status(400).json({
          error: 'Credit payment requires a customer',
        });
      }

      // Generate invoice number
      const invoiceNumber = await generateDocumentNumber('INV');

      // Create sale transaction
      const sale = await prisma.$transaction(async (tx) => {
        // Create sale
        const newSale = await tx.sale.create({
          data: {
            invoiceNumber,
            customerId: customerId || null,
            cashierId,
            saleDate: new Date(),
            subtotal,
            discount: saleDiscount,
            tax: totalTax,
            totalAmount,
            status: 'COMPLETED',
            notes,
            items: {
              create: processedItems.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                unit: item.unit,
                unitPrice: item.unitPrice,
                unitCost: item.unitCost,
                discount: item.discount,
                lineTotal: item.lineTotal,
              })),
            },
            payments: {
              create: payments.map((p: any) => ({
                method: p.method,
                amount: new Prisma.Decimal(p.amount),
                reference: p.reference,
              })),
            },
          },
          include: {
            items: true,
            payments: true,
          },
        });

        // Update stock batches (FIFO)
        for (const item of processedItems) {
          if (item.product.trackInventory) {
            const batchUpdates = createBatchUpdates(
              item.fifoResult.batches,
              item.quantityInBaseUnit
            );

            for (const update of batchUpdates) {
              await tx.stockBatch.update({
                where: { id: update.batchId },
                data: { quantity: update.newQuantity },
              });
            }
          }
        }

        // Handle credit payment - update customer balance
        const creditPayment = payments.find((p: any) => p.method === 'CREDIT');
        if (creditPayment && customerId) {
          const creditAmount = new Prisma.Decimal(creditPayment.amount);

          await tx.customerTransaction.create({
            data: {
              customerId,
              type: 'SALE',
              amount: creditAmount,
              balance: creditAmount, // Will be updated by trigger or separate logic
              description: `Credit sale - ${invoiceNumber}`,
              referenceId: newSale.id,
            },
          });

          // Update customer balance
          await tx.customer.update({
            where: { id: customerId },
            data: {
              creditBalance: { increment: creditAmount },
            },
          });
        }

        return newSale;
      });

      logger.info(`Created sale: ${sale.invoiceNumber}`, {
        userId: cashierId,
        totalAmount: sale.totalAmount.toString(),
      });

      // Return full sale details
      const fullSale = await prisma.sale.findUnique({
        where: { id: sale.id },
        include: {
          customer: true,
          cashier: { select: { id: true, username: true, fullName: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
          payments: true,
        },
      });

      res.status(201).json(fullSale);
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/sales/:id - Update sale (limited - mainly for status)
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  updateSaleValidation,
  validate,
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      const existingSale = await prisma.sale.findUnique({
        where: { id },
        include: { items: true, payments: true },
      });

      if (!existingSale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      // Cannot modify completed sales (except to cancel)
      if (existingSale.status === 'COMPLETED' && status !== 'CANCELLED') {
        return res.status(400).json({
          error: 'Cannot modify completed sale. You can only cancel it.',
        });
      }

      const updateData: any = {};
      if (notes !== undefined) updateData.notes = notes;
      if (status !== undefined) updateData.status = status;

      const sale = await prisma.sale.update({
        where: { id },
        data: updateData,
        include: {
          customer: true,
          cashier: { select: { id: true, username: true, fullName: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, baseUnit: true } },
            },
          },
          payments: true,
        },
      });

      logger.info(`Updated sale: ${sale.invoiceNumber}`, { userId: req.user?.id });

      res.json(sale);
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sales/:id/cancel - Cancel a sale and restore stock
router.post(
  '/:id/cancel',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { id } = req.params;
      const { reason } = req.body;

      const sale = await prisma.sale.findUnique({
        where: { id },
        include: {
          items: {
            include: { product: true },
          },
          payments: true,
          customer: true,
        },
      });

      if (!sale) {
        return res.status(404).json({ error: 'Sale not found' });
      }

      if (sale.status === 'CANCELLED' || sale.status === 'REFUNDED') {
        return res.status(400).json({ error: 'Sale is already cancelled or refunded' });
      }

      // Cancel sale and restore stock
      const cancelledSale = await prisma.$transaction(async (tx) => {
        // Update sale status
        const updated = await tx.sale.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            notes: `${sale.notes || ''}\n[CANCELLED] ${reason || 'No reason provided'}`,
          },
        });

        // Restore stock for tracked products
        for (const item of sale.items) {
          if (item.product.trackInventory) {
            // Create a new batch for the returned stock
            await tx.stockBatch.create({
              data: {
                productId: item.productId,
                quantity: item.quantity,
                unitCost: item.unitCost,
                purchaseDate: new Date(),
                expiryDate: null,
                batchNumber: `RETURN-${sale.invoiceNumber}`,
                purchaseId: null,
              },
            });
          }
        }

        // Reverse customer credit if applicable
        const creditPayment = sale.payments.find((p) => p.method === 'CREDIT');
        if (creditPayment && sale.customerId) {
          await tx.customerTransaction.create({
            data: {
              customerId: sale.customerId,
              type: 'PAYMENT',
              amount: creditPayment.amount.neg(),
              balance: new Prisma.Decimal(0),
              description: `Sale cancellation - ${sale.invoiceNumber}`,
              referenceId: sale.id,
            },
          });

          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              creditBalance: { decrement: creditPayment.amount },
            },
          });
        }

        return updated;
      });

      logger.info(`Cancelled sale: ${sale.invoiceNumber}`, {
        userId: req.user?.id,
        reason,
      });

      res.json({ message: 'Sale cancelled successfully', sale: cancelledSale });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/stats/daily - Daily sales statistics
router.get(
  '/stats/daily',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { date } = req.query;
      const targetDate = date ? new Date(date as string) : new Date();
      
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);

      const [salesStats, topProducts] = await Promise.all([
        prisma.sale.aggregate({
          where: {
            saleDate: { gte: startOfDay, lte: endOfDay },
            status: 'COMPLETED',
          },
          _count: true,
          _sum: {
            subtotal: true,
            discount: true,
            tax: true,
            totalAmount: true,
          },
        }),
        prisma.saleItem.groupBy({
          by: ['productId'],
          where: {
            sale: {
              saleDate: { gte: startOfDay, lte: endOfDay },
              status: 'COMPLETED',
            },
          },
          _sum: {
            quantity: true,
            lineTotal: true,
          },
          orderBy: {
            _sum: { lineTotal: 'desc' },
          },
          take: 10,
        }),
      ]);

      // Get product details for top products
      const topProductsWithDetails = await Promise.all(
        topProducts.map(async (item) => {
          const product = await prisma.product.findUnique({
            where: { id: item.productId },
            select: { id: true, name: true, sku: true },
          });
          return {
            product,
            quantitySold: item._sum.quantity,
            totalSales: item._sum.lineTotal,
          };
        })
      );

      logger.info('Retrieved daily sales stats', { userId: req.user?.id });

      res.json({
        date: targetDate,
        totalSales: salesStats._count,
        subtotal: salesStats._sum.subtotal || new Prisma.Decimal(0),
        discount: salesStats._sum.discount || new Prisma.Decimal(0),
        tax: salesStats._sum.tax || new Prisma.Decimal(0),
        totalAmount: salesStats._sum.totalAmount || new Prisma.Decimal(0),
        topProducts: topProductsWithDetails,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sales/stats/summary - Sales summary for date range
router.get(
  '/stats/summary',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req, res, next) => {
    try {
      const { startDate, endDate } = req.query;
      
      const where: any = { status: 'COMPLETED' };
      
      if (startDate || endDate) {
        where.saleDate = {};
        if (startDate) where.saleDate.gte = new Date(startDate as string);
        if (endDate) {
          const end = new Date(endDate as string);
          end.setHours(23, 59, 59, 999);
          where.saleDate.lte = end;
        }
      }

      const [salesStats, paymentStats] = await Promise.all([
        prisma.sale.aggregate({
          where,
          _count: true,
          _sum: {
            subtotal: true,
            discount: true,
            tax: true,
            totalAmount: true,
          },
          _avg: { totalAmount: true },
        }),
        prisma.payment.groupBy({
          by: ['method'],
          where: {
            sale: where,
          },
          _sum: { amount: true },
          _count: true,
        }),
      ]);

      logger.info('Retrieved sales summary', { userId: req.user?.id });

      res.json({
        period: { startDate, endDate },
        totalSales: salesStats._count,
        subtotal: salesStats._sum.subtotal || new Prisma.Decimal(0),
        discount: salesStats._sum.discount || new Prisma.Decimal(0),
        tax: salesStats._sum.tax || new Prisma.Decimal(0),
        totalAmount: salesStats._sum.totalAmount || new Prisma.Decimal(0),
        averageSale: salesStats._avg.totalAmount || new Prisma.Decimal(0),
        paymentMethods: paymentStats,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
