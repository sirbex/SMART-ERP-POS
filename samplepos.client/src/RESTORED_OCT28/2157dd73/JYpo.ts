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

const PaymentAllocationSchema = z.object({
  purchaseOrderId: z.string().cuid().optional(),
  invoiceId: z.string().cuid().optional(),
  amount: z.number().positive(),
});

const CreateSupplierPaymentSchema = z.object({
  supplierId: z.string().cuid(),
  totalAmount: z.number().positive(),
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY']),
  referenceNumber: z.string().optional(),
  checkNumber: z.string().optional(),
  cardLast4: z.string().max(4).optional(),
  bankReference: z.string().optional(),
  notes: z.string().optional(),
  allocations: z.array(PaymentAllocationSchema).min(1, 'At least one allocation is required'),
});

// ============================================================================
// GET /api/supplier-payments/supplier/:supplierId/outstanding - Get unpaid bills
// ============================================================================
router.get(
  '/supplier/:supplierId/outstanding',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { supplierId } = req.params;

      // Verify supplier exists
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

      // Get unpaid/partially paid purchase orders
      const unpaidPOs = await prisma.purchaseOrder.findMany({
        where: {
          supplierId,
          status: { in: ['PENDING', 'PARTIAL', 'COMPLETED'] },
          amountOutstanding: { gt: 0 },
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { orderDate: 'asc' },
      });

      // Get unpaid/partially paid invoices
      const unpaidInvoices = await prisma.invoice.findMany({
        where: {
          supplierId,
          paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
          amountOutstanding: { gt: 0 },
        },
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true },
              },
            },
          },
        },
        orderBy: { invoiceDate: 'asc' },
      });

      // Format response
      const outstandingPOs = unpaidPOs.map((po: any) => ({
        id: po.id,
        poNumber: po.poNumber,
        orderDate: po.orderDate,
        totalAmount: po.totalAmount.toString(),
        amountPaid: po.amountPaid.toString(),
        amountOutstanding: po.amountOutstanding.toString(),
        paymentStatus: po.paymentStatus,
        items: po.items.map((item: any) => ({
          product: item.product.name,
          quantity: item.orderedQuantity.toString(),
          unitPrice: item.unitPrice.toString(),
        })),
        notes: po.notes,
      }));

      const outstandingInvoices = unpaidInvoices.map((inv: any) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        totalAmount: inv.totalAmount.toString(),
        amountPaid: inv.amountPaid.toString(),
        amountOutstanding: inv.amountOutstanding.toString(),
        paymentStatus: inv.paymentStatus,
        items: inv.items.map((item: any) => ({
          product: item.product.name,
          description: item.description,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
        })),
        notes: inv.notes,
      }));

      const totalOutstanding = [
        ...unpaidPOs.map((po: any) => po.amountOutstanding),
        ...unpaidInvoices.map((inv: any) => inv.amountOutstanding),
      ].reduce((sum: any, amt: any) => sum.plus(amt), new Prisma.Decimal(0));

      res.json({
        supplier: {
          id: supplier.id,
          name: supplier.name,
          currentBalance: supplier.accountBalance?.toString() || '0',
          totalPaid: supplier.totalPaid?.toString() || '0',
          totalPurchased: supplier.totalPurchased?.toString() || '0',
        },
        outstanding: {
          totalAmount: totalOutstanding.toString(),
          purchaseOrders: outstandingPOs,
          invoices: outstandingInvoices,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// POST /api/supplier-payments - Record supplier payment with allocations
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
        totalAmount,
        paymentDate,
        paymentMethod,
        referenceNumber,
        checkNumber,
        cardLast4,
        bankReference,
        notes,
        allocations,
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

      // Validate allocations total matches payment amount
      const allocatedTotal = allocations.reduce((sum, alloc) => sum + alloc.amount, 0);
      if (Math.abs(allocatedTotal - totalAmount) > 0.01) {
        return res.status(400).json({
          error: 'Allocation mismatch',
          details: `Total allocated (${allocatedTotal}) does not match payment amount (${totalAmount})`,
        });
      }

      const paidDate = paymentDate ? new Date(paymentDate) : new Date();

      // Process payment in transaction
      const result = await prisma.$transaction(async (tx: any) => {
        // 1. Create supplier payment record
        const payment = await tx.supplierPayment.create({
          data: {
            supplierId,
            amount: new Prisma.Decimal(totalAmount),
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

        // 2. Create allocations and update PO/Invoice balances
        const allocationRecords = [];
        for (const alloc of allocations) {
          // Create allocation record
          const allocRecord = await tx.supplierPaymentAllocation.create({
            data: {
              supplierPaymentId: payment.id,
              purchaseOrderId: alloc.purchaseOrderId,
              invoiceId: alloc.invoiceId,
              allocatedAmount: new Prisma.Decimal(alloc.amount),
            },
          });
          allocationRecords.push(allocRecord);

          // Update Purchase Order if allocated to PO
          if (alloc.purchaseOrderId) {
            const po = await tx.purchaseOrder.findUnique({
              where: { id: alloc.purchaseOrderId },
              select: { amountPaid: true, totalAmount: true },
            });

            if (!po) {
              throw new Error(`Purchase Order ${alloc.purchaseOrderId} not found`);
            }

            const newAmountPaid = po.amountPaid.plus(alloc.amount);
            const newOutstanding = po.totalAmount.minus(newAmountPaid);

            let paymentStatus = 'UNPAID';
            if (newOutstanding.lte(0)) {
              paymentStatus = 'PAID';
            } else if (newAmountPaid.gt(0)) {
              paymentStatus = 'PARTIAL';
            }

            await tx.purchaseOrder.update({
              where: { id: alloc.purchaseOrderId },
              data: {
                amountPaid: newAmountPaid,
                amountOutstanding: newOutstanding,
                paymentStatus,
              },
            });
          }

          // Update Invoice if allocated to invoice
          if (alloc.invoiceId) {
            const invoice = await tx.invoice.findUnique({
              where: { id: alloc.invoiceId },
              select: { amountPaid: true, totalAmount: true },
            });

            if (!invoice) {
              throw new Error(`Invoice ${alloc.invoiceId} not found`);
            }

            const newAmountPaid = invoice.amountPaid.plus(alloc.amount);
            const newOutstanding = invoice.totalAmount.minus(newAmountPaid);

            let paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID' = 'UNPAID';
            if (newOutstanding.lt(0)) {
              paymentStatus = 'OVERPAID';
            } else if (newOutstanding.lte(0.01)) {
              paymentStatus = 'PAID';
            } else if (newAmountPaid.gt(0)) {
              paymentStatus = 'PARTIAL';
            }

            await tx.invoice.update({
              where: { id: alloc.invoiceId },
              data: {
                amountPaid: newAmountPaid,
                amountOutstanding: newOutstanding,
                paymentStatus,
              },
            });
          }
        }

        // 3. Update supplier financial stats
        const currentBalance = supplier.accountBalance || new Prisma.Decimal(0);
        const currentTotalPaid = supplier.totalPaid || new Prisma.Decimal(0);
        const newBalance = currentBalance.minus(totalAmount);
        const newTotalPaid = currentTotalPaid.plus(totalAmount);

        await tx.supplier.update({
          where: { id: supplierId },
          data: {
            accountBalance: newBalance,
            totalPaid: newTotalPaid,
            lastPaymentDate: paidDate,
          },
        });

        // 4. Post to General Ledger
        const { postLedger } = await import('../services/accounting/postLedger.js');

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

        await postLedger({
          description: `Supplier payment to ${supplier.name} - Ref: ${payment.referenceNumber || payment.id}`,
          date: paidDate,
          refType: 'supplier_payment',
          refId: payment.id,
          entries: [
            {
              transactionId: '',
              accountId: accountsPayableAccount.id,
              amount: new Prisma.Decimal(totalAmount),
              type: 'debit' as const,
              currency: 'UGX',
              refType: 'supplier_payment',
              refId: payment.id,
            },
            {
              transactionId: '',
              accountId: cashAccount.id,
              amount: new Prisma.Decimal(totalAmount),
              type: 'credit' as const,
              currency: 'UGX',
              refType: 'supplier_payment',
              refId: payment.id,
            },
          ],
        });

        return {
          payment,
          allocations: allocationRecords,
          newBalance,
          newTotalPaid,
        };
      });

      logger.info(
        `Supplier payment recorded: ${totalAmount} for ${supplier.name} (${supplierId})`,
        {
          paymentId: result.payment.id,
          supplierId,
          amount: totalAmount,
          allocations: allocations.length,
          userId,
        }
      );

      res.status(201).json({
        message: 'Supplier payment recorded successfully',
        payment: {
          id: result.payment.id,
          supplierId: supplier.id,
          supplierName: supplier.name,
          amount: result.payment.amount.toString(),
          paymentDate: result.payment.paymentDate,
          paymentMethod: result.payment.paymentMethod,
          referenceNumber: result.payment.referenceNumber,
          allocations: result.allocations.map((a: any) => ({
            id: a.id,
            purchaseOrderId: a.purchaseOrderId,
            invoiceId: a.invoiceId,
            amount: a.allocatedAmount.toString(),
          })),
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
          include: {
            allocations: {
              include: {
                purchaseOrder: {
                  select: { poNumber: true },
                },
                invoice: {
                  select: { invoiceNumber: true },
                },
              },
            },
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
          allocations: p.allocations.map((a: any) => ({
            amount: a.allocatedAmount.toString(),
            poNumber: a.purchaseOrder?.poNumber,
            invoiceNumber: a.invoice?.invoiceNumber,
          })),
        })),
      });
    } catch (error) {
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
                fullName: true,
              },
            },
            allocations: {
              include: {
                purchaseOrder: {
                  select: { poNumber: true, totalAmount: true },
                },
                invoice: {
                  select: { invoiceNumber: true, totalAmount: true },
                },
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
          processedBy: p.processedBy
            ? { id: p.processedBy.id, name: p.processedBy.fullName }
            : null,
          allocations: p.allocations.map((a: any) => ({
            amount: a.allocatedAmount.toString(),
            purchaseOrder: a.purchaseOrder
              ? { poNumber: a.purchaseOrder.poNumber, totalAmount: a.purchaseOrder.totalAmount.toString() }
              : null,
            invoice: a.invoice
              ? { invoiceNumber: a.invoice.invoiceNumber, totalAmount: a.invoice.totalAmount.toString() }
              : null,
          })),
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
              fullName: true,
              email: true,
            },
          },
          allocations: {
            include: {
              purchaseOrder: {
                select: {
                  id: true,
                  poNumber: true,
                  orderDate: true,
                  totalAmount: true,
                  amountPaid: true,
                  amountOutstanding: true,
                  paymentStatus: true,
                },
              },
              invoice: {
                select: {
                  id: true,
                  invoiceNumber: true,
                  invoiceDate: true,
                  dueDate: true,
                  totalAmount: true,
                  amountPaid: true,
                  amountOutstanding: true,
                  paymentStatus: true,
                },
              },
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
        processedBy: payment.processedBy
          ? { id: payment.processedBy.id, name: payment.processedBy.fullName, email: payment.processedBy.email }
          : null,
        allocations: payment.allocations.map((a: any) => ({
          id: a.id,
          amount: a.allocatedAmount.toString(),
          purchaseOrder: a.purchaseOrder
            ? {
                ...a.purchaseOrder,
                totalAmount: a.purchaseOrder.totalAmount.toString(),
                amountPaid: a.purchaseOrder.amountPaid.toString(),
                amountOutstanding: a.purchaseOrder.amountOutstanding.toString(),
              }
            : null,
          invoice: a.invoice
            ? {
                ...a.invoice,
                totalAmount: a.invoice.totalAmount.toString(),
                amountPaid: a.invoice.amountPaid.toString(),
                amountOutstanding: a.invoice.amountOutstanding.toString(),
              }
            : null,
        })),
        createdAt: payment.createdAt,
        updatedAt: payment.updatedAt,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
