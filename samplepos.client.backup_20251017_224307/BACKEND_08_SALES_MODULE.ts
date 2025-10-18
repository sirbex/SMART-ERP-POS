// ============================================================================
// SALES MODULE - Complete POS with FIFO Cost Calculation
// ============================================================================
// FILE: pos-backend/src/modules/sales.ts

import { Router } from 'express';
import { body, param } from 'express-validator';
import { UserRole, Prisma } from '@prisma/client';
import { prisma } from '../config/database.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { asyncHandler, createError } from '../middleware/errorHandler.js';
import { validate } from '../middleware/validation.js';
import { parsePagination, buildPaginationResponse, generateDocumentNumber, parseDateRange } from '../utils/helpers.js';
import { calculateFIFO, createBatchUpdates } from '../utils/fifoCalculator.js';
import { convertToBaseUnit } from '../utils/uomConverter.js';
import { Decimal } from '@prisma/client/runtime/library';

export const saleRouter = Router();

saleRouter.use(authenticate);

// ============================================================================
// GET ALL SALES
// ============================================================================

saleRouter.get('/',
  asyncHandler(async (req, res) => {
    const { page, limit, search, customerId, status, startDate, endDate } = req.query;
    const pagination = parsePagination(page as string, limit as string);
    const dateRange = parseDateRange(startDate as string, endDate as string);

    const where: any = {};

    if (search) {
      where.saleNumber = { contains: search as string, mode: 'insensitive' };
    }

    if (customerId) {
      where.customerId = customerId;
    }

    if (status) {
      where.status = status;
    }

    if (dateRange.startDate || dateRange.endDate) {
      where.saleDate = {};
      if (dateRange.startDate) where.saleDate.gte = dateRange.startDate;
      if (dateRange.endDate) where.saleDate.lte = dateRange.endDate;
    }

    const [sales, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          createdBy: { select: { id: true, username: true, fullName: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, barcode: true, baseUnit: true } }
            }
          },
          payments: true
        },
        orderBy: { saleDate: 'desc' },
        skip: pagination.skip,
        take: pagination.limit
      }),
      prisma.sale.count({ where })
    ]);

    res.json(buildPaginationResponse(sales, total, pagination));
  })
);

// ============================================================================
// GET SALE BY ID
// ============================================================================

saleRouter.get('/:id',
  validate([param('id').isString()]),
  asyncHandler(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        createdBy: { select: { id: true, username: true, fullName: true } },
        items: {
          include: {
            product: true
          }
        },
        payments: true
      }
    });

    if (!sale) {
      throw createError('Sale not found', 404);
    }

    res.json(sale);
  })
);

// ============================================================================
// CREATE SALE (POS Transaction with FIFO)
// ============================================================================

saleRouter.post('/',
  validate([
    body('items').isArray({ min: 1 }).withMessage('At least one item required'),
    body('items.*.productId').isString(),
    body('items.*.quantity').isDecimal({ decimal_digits: '0,4' }),
    body('items.*.unit').isIn(['base', 'alternate']),
    body('items.*.unitPrice').isDecimal({ decimal_digits: '0,2' }),
    body('items.*.discount').optional().isDecimal({ decimal_digits: '0,2' }),
    body('customerId').optional().isString(),
    body('payments').isArray({ min: 1 }),
    body('payments.*.amount').isDecimal({ decimal_digits: '0,2' }),
    body('payments.*.method').isIn(['CASH', 'CARD', 'CREDIT', 'BANK_TRANSFER'])
  ]),
  asyncHandler(async (req: AuthRequest, res) => {
    const { items, customerId, payments, notes } = req.body;

    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Generate sale number
      const lastSale = await tx.sale.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { saleNumber: true }
      });
      const lastNumber = lastSale ? parseInt(lastSale.saleNumber.split('-').pop() || '0') : 0;
      const saleNumber = generateDocumentNumber('SAL', lastNumber);

      // 2. Process each sale item with FIFO
      const processedItems = [];
      const batchUpdates = [];

      for (const item of items) {
        // Get product with batches
        const product = await tx.product.findUnique({
          where: { id: item.productId },
          include: {
            stockBatches: {
              where: { quantityRemaining: { gt: 0 } },
              orderBy: { receivedDate: 'asc' }
            }
          }
        });

        if (!product) {
          throw createError(`Product ${item.productId} not found`, 404);
        }

        // Convert quantity to base unit
        const quantityInBase = convertToBaseUnit(
          product,
          new Decimal(item.quantity),
          item.unit
        );

        // Check stock availability
        if (product.currentStock.lt(quantityInBase)) {
          throw createError(`Insufficient stock for ${product.name}`, 400);
        }

        // Calculate FIFO cost
        const fifoResult = calculateFIFO(product.stockBatches, quantityInBase);

        // Calculate item totals
        const unitPrice = new Decimal(item.unitPrice);
        const discount = new Decimal(item.discount || 0);
        const subtotal = unitPrice.mul(item.quantity);
        const taxRate = product.taxRate;
        const taxAmount = subtotal.mul(taxRate);
        const total = subtotal.add(taxAmount).sub(discount);

        // Calculate profit
        const costTotal = fifoResult.totalCost;
        const profit = total.sub(costTotal);

        processedItems.push({
          productId: product.id,
          quantity: new Decimal(item.quantity),
          unit: item.unit,
          quantityInBase,
          unitPrice,
          unitCost: fifoResult.averageCost,
          subtotal,
          taxRate,
          taxAmount,
          discount,
          total,
          costTotal,
          profit
        });

        // Collect batch updates
        batchUpdates.push(...createBatchUpdates(fifoResult.allocations));
      }

      // 3. Calculate sale totals
      const subtotal = processedItems.reduce((sum, item) => sum.add(item.subtotal), new Decimal(0));
      const taxAmount = processedItems.reduce((sum, item) => sum.add(item.taxAmount), new Decimal(0));
      const discount = processedItems.reduce((sum, item) => sum.add(item.discount), new Decimal(0));
      const totalAmount = processedItems.reduce((sum, item) => sum.add(item.total), new Decimal(0));
      const totalCost = processedItems.reduce((sum, item) => sum.add(item.costTotal), new Decimal(0));
      const profit = totalAmount.sub(totalCost);

      // 4. Validate payments
      const totalPaid = payments.reduce((sum: Decimal, p: any) => sum.add(new Decimal(p.amount)), new Decimal(0));
      if (totalPaid.lt(totalAmount)) {
        throw createError('Insufficient payment amount', 400);
      }

      // 5. Create sale
      const sale = await tx.sale.create({
        data: {
          saleNumber,
          customerId: customerId || null,
          subtotal,
          taxAmount,
          discount,
          totalAmount,
          totalCost,
          profit,
          notes,
          createdById: req.user!.id,
          items: {
            create: processedItems
          },
          payments: {
            create: payments.map((p: any) => ({
              amount: new Decimal(p.amount),
              method: p.method,
              reference: p.reference,
              notes: p.notes
            }))
          }
        },
        include: {
          items: { include: { product: true } },
          payments: true,
          customer: true
        }
      });

      // 6. Update stock batches
      for (const update of batchUpdates) {
        await tx.stockBatch.update(update);
      }

      // 7. Update product stock
      for (const item of processedItems) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { decrement: item.quantityInBase },
            costPrice: item.unitCost // Update with latest FIFO cost
          }
        });
      }

      // 8. If customer and credit sale, update customer balance
      if (customerId && payments.some((p: any) => p.method === 'CREDIT')) {
        const creditAmount = payments
          .filter((p: any) => p.method === 'CREDIT')
          .reduce((sum: Decimal, p: any) => sum.add(new Decimal(p.amount)), new Decimal(0));

        await tx.customer.update({
          where: { id: customerId },
          data: {
            currentBalance: { increment: creditAmount }
          }
        });

        // Create customer transaction
        const customer = await tx.customer.findUnique({ where: { id: customerId } });
        await tx.customerTransaction.create({
          data: {
            customerId,
            type: 'SALE',
            amount: creditAmount,
            balance: customer!.currentBalance.add(creditAmount),
            description: `Sale ${saleNumber}`,
            referenceId: sale.id,
            createdBy: req.user!.id
          }
        });
      }

      return sale;
    });

    res.status(201).json({
      message: 'Sale created successfully',
      sale: result
    });
  })
);

// ============================================================================
// UPDATE SALE (only status and notes)
// ============================================================================

saleRouter.put('/:id',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate([
    param('id').isString(),
    body('status').optional().isIn(['PENDING', 'COMPLETED', 'CANCELLED', 'REFUNDED']),
    body('notes').optional().isString()
  ]),
  asyncHandler(async (req, res) => {
    const { status, notes } = req.body;

    const sale = await prisma.sale.update({
      where: { id: req.params.id },
      data: {
        ...(status && { status }),
        ...(notes !== undefined && { notes })
      },
      include: {
        items: { include: { product: true } },
        payments: true
      }
    });

    res.json({
      message: 'Sale updated successfully',
      sale
    });
  })
);

// ============================================================================
// CANCEL SALE (reverse stock and payments)
// ============================================================================

saleRouter.post('/:id/cancel',
  authorize(UserRole.ADMIN, UserRole.MANAGER),
  validate([param('id').isString()]),
  asyncHandler(async (req, res) => {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: req.params.id },
        include: {
          items: true,
          payments: true
        }
      });

      if (!sale) {
        throw createError('Sale not found', 404);
      }

      if (sale.status === 'CANCELLED') {
        throw createError('Sale already cancelled', 400);
      }

      // 1. Restore stock
      for (const item of sale.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            currentStock: { increment: item.quantityInBase }
          }
        });
      }

      // 2. If credit sale, reverse customer balance
      if (sale.customerId) {
        const creditPayments = sale.payments.filter(p => p.method === 'CREDIT');
        if (creditPayments.length > 0) {
          const creditAmount = creditPayments.reduce((sum, p) => sum.add(p.amount), new Decimal(0));

          await tx.customer.update({
            where: { id: sale.customerId },
            data: {
              currentBalance: { decrement: creditAmount }
            }
          });

          const customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
          await tx.customerTransaction.create({
            data: {
              customerId: sale.customerId,
              type: 'ADJUSTMENT',
              amount: creditAmount.neg(),
              balance: customer!.currentBalance,
              description: `Cancelled sale ${sale.saleNumber}`,
              referenceId: sale.id
            }
          });
        }
      }

      // 3. Update sale status
      const updatedSale = await tx.sale.update({
        where: { id: req.params.id },
        data: {
          status: 'CANCELLED',
          profit: new Decimal(0)
        }
      });

      return updatedSale;
    });

    res.json({
      message: 'Sale cancelled successfully',
      sale: result
    });
  })
);

// ============================================================================
// GET SALES SUMMARY
// ============================================================================

saleRouter.get('/summary/stats',
  asyncHandler(async (req, res) => {
    const { startDate, endDate } = req.query;
    const dateRange = parseDateRange(startDate as string, endDate as string);

    const where: any = { status: 'COMPLETED' };
    if (dateRange.startDate || dateRange.endDate) {
      where.saleDate = {};
      if (dateRange.startDate) where.saleDate.gte = dateRange.startDate;
      if (dateRange.endDate) where.saleDate.lte = dateRange.endDate;
    }

    const [totalSales, salesCount, aggregates] = await Promise.all([
      prisma.sale.aggregate({
        where,
        _sum: { totalAmount: true, profit: true, totalCost: true },
        _avg: { totalAmount: true }
      }),
      prisma.sale.count({ where }),
      prisma.sale.groupBy({
        by: ['status'],
        where: dateRange.startDate || dateRange.endDate ? { saleDate: where.saleDate } : {},
        _count: true,
        _sum: { totalAmount: true }
      })
    ]);

    res.json({
      totalRevenue: totalSales._sum.totalAmount || 0,
      totalProfit: totalSales._sum.profit || 0,
      totalCost: totalSales._sum.totalCost || 0,
      averageSaleValue: totalSales._avg.totalAmount || 0,
      salesCount,
      byStatus: aggregates
    });
  })
);

console.log('✅ Sales module with FIFO created');
