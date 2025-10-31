import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import logger from '../utils/logger.js';
import { Prisma } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CreateSupplierPaymentSchema = z.object({
  supplierId: z.string().cuid(),
  amount: z.number().positive(),
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']),
  referenceNumber: z.string().optional(),
  checkNumber: z.string().optional(),
  cardLast4: z.string().max(4).optional(),
  bankReference: z.string().optional(),
  notes: z.string().optional(),
  purchaseOrderIds: z.array(z.string().cuid()).optional(),
});

// ============================================================================
// POST /api/supplier-payments - Record supplier payment
// ============================================================================
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = CreateSupplierPaymentSchema.parse(req.body);
      const userId = (req as any).user?.id;

      const {
        supplierId,
        amount,
        paymentDate,
        paymentMethod,
        referenceNumber,
        checkNumber,
        cardLast4,
        bankReference,
        notes,
        purchaseOrderIds,
      } = validatedData;

      // Verify supplier exists
      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          id: true,
          name: true,
          accountBalance: true,
          totalPaid: true,
        },
      });

      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      const paidDate = paymentDate ? new Date(paymentDate) : new Date();

      // Process payment in transaction
      const result = await prisma.$transaction(async (tx: any) => {
        // Create supplier payment record
        const payment = await tx.supplierPayment.create({
          data: {
            supplierId,
            amount: new Prisma.Decimal(amount),
            paymentDate: paidDate,
            paymentMethod,
            referenceNumber,
            checkNumber,
            cardLast4,
            bankReference,
            notes,
            processedById: userId,
          },
        });

        // Update supplier financial stats
        const currentBalance = supplier.accountBalance || new Prisma.Decimal(0);
        const currentTotalPaid = supplier.totalPaid || new Prisma.Decimal(0);
        const newBalance = currentBalance.minus(amount);
        const newTotalPaid = currentTotalPaid.plus(amount);

        await tx.supplier.update({
          where: { id: supplierId },
          data: {
            accountBalance: newBalance,
            totalPaid: newTotalPaid,
          },
        });

        // If specific POs are provided, allocate payment to them
        if (purchaseOrderIds && purchaseOrderIds.length > 0) {
          const purchaseOrders = await tx.purchaseOrder.findMany({
            where: {
              id: { in: purchaseOrderIds },
              supplierId,
            },
            select: { id: true, poNumber: true, totalAmount: true },
          });

          if (purchaseOrders.length !== purchaseOrderIds.length) {
            throw new Error('One or more purchase orders not found or do not belong to supplier');
          }
        }

        // === POST TO GENERAL LEDGER ===
        // Import postLedger dynamically to avoid circular dependencies
        const { postLedger } = await import('../services/accounting/postLedger.js');

        // Get GL accounts for Accounts Payable and Cash
        const accountsPayableAccount = await tx.account.findFirst({
          where: { code: 'ACCOUNTS_PAYABLE' },
          select: { id: true },
        });

        const cashAccount = await tx.account.findFirst({
          where: { code: 'CASH_IN_HAND' },
          select: { id: true },
        });

        if (!accountsPayableAccount || !cashAccount) {
          throw new Error('Required GL accounts not found (ACCOUNTS_PAYABLE or CASH_IN_HAND)');
        }

        // Journal Entry for Supplier Payment:
        // Debit: Accounts Payable (reduces liability)
        // Credit: Cash (reduces asset)
        await postLedger({
          description: `Supplier payment to ${supplier.name} - Ref: ${payment.referenceNumber || payment.id}`,
          date: paidDate,
          refType: 'supplier_payment',
          refId: payment.id,
          entries: [
            {
              transactionId: '',
              accountId: accountsPayableAccount.id,
              amount: new Prisma.Decimal(amount),
              type: 'debit' as const,
              currency: 'UGX',
              refType: 'supplier_payment',
              refId: payment.id,
            },
            {
              transactionId: '',
              accountId: cashAccount.id,
              amount: new Prisma.Decimal(amount),
              type: 'credit' as const,
              currency: 'UGX',
              refType: 'supplier_payment',
              refId: payment.id,
            },
          ],
        });

        return {
          payment,
          newBalance,
          newTotalPaid,
          supplier: {
            id: supplier.id,
            name: supplier.name,
          },
        };
      });

      logger.info(
        `Supplier payment recorded: ${amount} for supplier ${supplier.name} (${supplierId})`,
        {
          paymentId: result.payment.id,
          supplierId,
          amount,
          paymentMethod,
          userId,
        }
      );

      res.status(201).json({
        message: 'Supplier payment recorded successfully',
        payment: {
          id: result.payment.id,
          supplierId: result.supplier.id,
          supplierName: result.supplier.name,
          amount: result.payment.amount.toString(),
          paymentDate: result.payment.paymentDate,
          paymentMethod: result.payment.paymentMethod,
          referenceNumber: result.payment.referenceNumber,
          newBalance: result.newBalance.toString(),
          newTotalPaid: result.newTotalPaid.toString(),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.errors,
        });
      }
      next(error);
    }
  }
);

// ============================================================================
// GET /api/supplier-payments - List all supplier payments
// ============================================================================
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { supplierId, startDate, endDate, paymentMethod } = req.query;

      const where: any = {};

      if (supplierId) {
        where.supplierId = supplierId as string;
      }

      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = new Date(startDate as string);
        if (endDate) where.paymentDate.lte = new Date(endDate as string);
      }

      if (paymentMethod) {
        where.paymentMethod = paymentMethod as string;
      }

      const [payments, total] = await Promise.all([
        prisma.supplierPayment.findMany({
          where,
          include: {
            supplier: {
              select: {
                id: true,
                name: true,
                contactPerson: true,
              },
            },
            processedBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { paymentDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.supplierPayment.count({ where }),
      ]);

      res.json({
        payments: payments.map((p: any) => ({
          id: p.id,
          supplier: p.supplier,
          amount: p.amount.toString(),
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          referenceNumber: p.referenceNumber,
          checkNumber: p.checkNumber,
          cardLast4: p.cardLast4,
          bankReference: p.bankReference,
          notes: p.notes,
          processedBy: p.processedBy,
          createdAt: p.createdAt,
        })),
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api/supplier-payments/:id - Get payment details
// ============================================================================
router.get(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const payment = await prisma.supplierPayment.findUnique({
        where: { id },
        include: {
          supplier: {
            select: {
              id: true,
              name: true,
              contactPerson: true,
              phone: true,
              email: true,
              accountBalance: true,
            },
          },
          processedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      if (!payment) {
        return res.status(404).json({ error: 'Payment not found' });
      }

      res.json({
        id: payment.id,
        supplier: payment.supplier,
        amount: payment.amount.toString(),
        paymentDate: payment.paymentDate,
        paymentMethod: payment.paymentMethod,
        referenceNumber: payment.referenceNumber,
        checkNumber: payment.checkNumber,
        cardLast4: payment.cardLast4,
        bankReference: payment.bankReference,
        notes: payment.notes,
        processedBy: payment.processedBy,
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// GET /api/supplier-payments/supplier/:supplierId/summary - Get payment summary
// ============================================================================
router.get(
  '/supplier/:supplierId/summary',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplierId } = req.params;
      const { startDate, endDate } = req.query;

      const supplier = await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          id: true,
          name: true,
          accountBalance: true,
          totalPaid: true,
          totalPurchased: true,
        },
      });

      if (!supplier) {
        return res.status(404).json({ error: 'Supplier not found' });
      }

      const where: any = { supplierId };
      if (startDate || endDate) {
        where.paymentDate = {};
        if (startDate) where.paymentDate.gte = new Date(startDate as string);
        if (endDate) where.paymentDate.lte = new Date(endDate as string);
      }

      const [paymentStats, recentPayments] = await Promise.all([
        prisma.supplierPayment.aggregate({
          where,
          _sum: { amount: true },
          _count: true,
          _avg: { amount: true },
        }),
        prisma.supplierPayment.findMany({
          where: { supplierId },
          orderBy: { paymentDate: 'desc' },
          take: 10,
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            paymentMethod: true,
            referenceNumber: true,
          },
        }),
      ]);

      res.json({
        supplier: {
          id: supplier.id,
          name: supplier.name,
          currentBalance: supplier.accountBalance?.toString() || '0',
          totalPaid: supplier.totalPaid?.toString() || '0',
          totalPurchased: supplier.totalPurchased?.toString() || '0',
        },
        summary: {
          totalPayments: paymentStats._count,
          totalAmount: paymentStats._sum.amount?.toString() || '0',
          averagePayment: paymentStats._avg.amount?.toString() || '0',
          periodStart: startDate,
          periodEnd: endDate,
        },
        recentPayments: recentPayments.map((p: any) => ({
          id: p.id,
          amount: p.amount.toString(),
          paymentDate: p.paymentDate,
          paymentMethod: p.paymentMethod,
          referenceNumber: p.referenceNumber,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
