import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { authorize } from '../middleware/authorize.js';
import logger from '../utils/logger.js';
import { Prisma as PrismaTypes } from '@prisma/client';
import { z } from 'zod';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const CreateInvoiceSchema = z.object({
  customerId: z.string().cuid().optional(),
  supplierId: z.string().cuid().optional(),
  saleId: z.string().cuid().optional(),
  purchaseOrderId: z.string().cuid().optional(),
  invoiceDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().cuid(),
      description: z.string(),
      quantity: z.number().positive(),
      unit: z.string(),
      unitPrice: z.number().positive(),
      taxRate: z.number().min(0).max(1).optional(),
      discount: z.number().min(0).optional(),
    })
  ),
});

const UpdateInvoiceSchema = z.object({
  status: z.enum(['DRAFT', 'ISSUED', 'SENT', 'PAID', 'PARTIAL', 'OVERDUE', 'CANCELLED', 'VOID']).optional(),
  dueDate: z.string().datetime().optional(),
  paymentTerms: z.string().optional(),
  notes: z.string().optional(),
});

// ============================================================================
// POST /api/invoices - Create invoice
// ============================================================================
router.post(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = CreateInvoiceSchema.parse(req.body);
      const userId = (req as any).user?.id;

      const {
        customerId,
        supplierId,
        saleId,
        purchaseOrderId,
        invoiceDate,
        dueDate,
        paymentTerms,
        notes,
        items,
      } = validatedData;

      // Validate: must have either customerId or supplierId
      if (!customerId && !supplierId) {
        return res.status(400).json({ error: 'Either customerId or supplierId is required' });
      }

      // Generate invoice number
      const latestInvoice = await prisma.invoice.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });

      const invoiceNum = latestInvoice
        ? parseInt(latestInvoice.invoiceNumber.split('-')[1]) + 1
        : 1;
      const invoiceNumber = `INV-${String(invoiceNum).padStart(6, '0')}`;

      const invoiceDateParsed = invoiceDate ? new Date(invoiceDate) : new Date();
      const dueDateParsed = dueDate ? new Date(dueDate) : undefined;

      // Calculate totals
      const itemsWithTotals = items.map((item) => {
        const subtotal = item.quantity * item.unitPrice;
        const discount = item.discount || 0;
        const taxRate = item.taxRate || 0;
        const taxAmount = (subtotal - discount) * taxRate;
        const total = subtotal - discount + taxAmount;

        return {
          ...item,
          subtotal: new Prisma.Decimal(subtotal),
          discount: new Prisma.Decimal(discount),
          taxRate: new Prisma.Decimal(taxRate),
          taxAmount: new Prisma.Decimal(taxAmount),
          total: new Prisma.Decimal(total),
        };
      });

      const subtotal = itemsWithTotals.reduce(
        (sum, item) => sum.plus(item.subtotal),
        new Prisma.Decimal(0)
      );
      const totalDiscount = itemsWithTotals.reduce(
        (sum, item) => sum.plus(item.discount),
        new Prisma.Decimal(0)
      );
      const totalTax = itemsWithTotals.reduce(
        (sum, item) => sum.plus(item.taxAmount),
        new Prisma.Decimal(0)
      );
      const totalAmount = itemsWithTotals.reduce(
        (sum, item) => sum.plus(item.total),
        new Prisma.Decimal(0)
      );

      // Create invoice with items
      const invoice = await prisma.$transaction(async (tx: any) => {
        const newInvoice = await tx.invoice.create({
          data: {
            invoiceNumber,
            invoiceDate: invoiceDateParsed,
            dueDate: dueDateParsed,
            customerId,
            supplierId,
            saleId,
            purchaseOrderId,
            status: 'DRAFT',
            subtotal,
            taxAmount: totalTax,
            discount: totalDiscount,
            totalAmount,
            amountPaid: new Prisma.Decimal(0),
            amountOutstanding: totalAmount,
            paymentStatus: 'UNPAID',
            paymentTerms,
            notes,
            createdById: userId,
            items: {
              create: itemsWithTotals.map((item) => ({
                productId: item.productId,
                description: item.description,
                quantity: new Prisma.Decimal(item.quantity),
                unit: item.unit,
                unitPrice: new Prisma.Decimal(item.unitPrice),
                taxRate: item.taxRate,
                taxAmount: item.taxAmount,
                discount: item.discount,
                subtotal: item.subtotal,
                total: item.total,
                deliveredQuantity: new Prisma.Decimal(0),
              })),
            },
          },
          include: {
            items: {
              include: {
                product: {
                  select: { id: true, name: true, barcode: true },
                },
              },
            },
            customer: {
              select: { id: true, name: true, email: true, phone: true },
            },
            supplier: {
              select: { id: true, name: true, email: true, phone: true },
            },
          },
        });

        // If linked to sale, mark sale as invoice generated
        if (saleId) {
          await tx.sale.update({
            where: { id: saleId },
            data: { invoiceGenerated: true },
          });
        }

        return newInvoice;
      });

      logger.info(`Invoice created: ${invoiceNumber}`, {
        invoiceId: invoice.id,
        customerId,
        supplierId,
        totalAmount: totalAmount.toString(),
        userId,
      });

      res.status(201).json({
        message: 'Invoice created successfully',
        invoice,
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
// GET /api/invoices - List invoices
// ============================================================================
router.get(
  '/',
  authenticate,
  authorize(['ADMIN', 'MANAGER', 'CASHIER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const skip = (page - 1) * limit;
      const { customerId, supplierId, status, startDate, endDate } = req.query;

      const where: any = {};

      if (customerId) where.customerId = customerId as string;
      if (supplierId) where.supplierId = supplierId as string;
      if (status) where.status = status as string;

      if (startDate || endDate) {
        where.invoiceDate = {};
        if (startDate) where.invoiceDate.gte = new Date(startDate as string);
        if (endDate) where.invoiceDate.lte = new Date(endDate as string);
      }

      const [invoices, total] = await Promise.all([
        prisma.invoice.findMany({
          where,
          include: {
            customer: {
              select: { id: true, name: true, email: true, phone: true },
            },
            supplier: {
              select: { id: true, name: true, email: true, phone: true },
            },
            items: {
              include: {
                product: {
                  select: { id: true, name: true, barcode: true },
                },
              },
            },
          },
          orderBy: { invoiceDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.invoice.count({ where }),
      ]);

      res.json({
        invoices: invoices.map((inv) => ({
          ...inv,
          subtotal: inv.subtotal.toString(),
          taxAmount: inv.taxAmount.toString(),
          discount: inv.discount.toString(),
          totalAmount: inv.totalAmount.toString(),
          amountPaid: inv.amountPaid.toString(),
          amountOutstanding: inv.amountOutstanding.toString(),
          items: inv.items.map((item) => ({
            ...item,
            quantity: item.quantity.toString(),
            unitPrice: item.unitPrice.toString(),
            taxRate: item.taxRate.toString(),
            taxAmount: item.taxAmount.toString(),
            discount: item.discount.toString(),
            subtotal: item.subtotal.toString(),
            total: item.total.toString(),
            deliveredQuantity: item.deliveredQuantity.toString(),
          })),
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
// GET /api/invoices/:id - Get invoice details
// ============================================================================
router.get(
  '/:id',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
            },
          },
          supplier: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              address: true,
            },
          },
          items: {
            include: {
              product: {
                select: { id: true, name: true, barcode: true },
              },
            },
          },
          deliveries: {
            select: {
              id: true,
              deliveryNumber: true,
              status: true,
              deliveryDate: true,
              actualDeliveryDate: true,
            },
          },
          sale: {
            select: {
              id: true,
              saleNumber: true,
              saleDate: true,
            },
          },
        },
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      res.json({
        ...invoice,
        subtotal: invoice.subtotal.toString(),
        taxAmount: invoice.taxAmount.toString(),
        discount: invoice.discount.toString(),
        totalAmount: invoice.totalAmount.toString(),
        amountPaid: invoice.amountPaid.toString(),
        amountOutstanding: invoice.amountOutstanding.toString(),
        items: invoice.items.map((item) => ({
          ...item,
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice.toString(),
          taxRate: item.taxRate.toString(),
          taxAmount: item.taxAmount.toString(),
          discount: item.discount.toString(),
          subtotal: item.subtotal.toString(),
          total: item.total.toString(),
          deliveredQuantity: item.deliveredQuantity.toString(),
        })),
      });
    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// PUT /api/invoices/:id - Update invoice
// ============================================================================
router.put(
  '/:id',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const validatedData = UpdateInvoiceSchema.parse(req.body);

      const existingInvoice = await prisma.invoice.findUnique({
        where: { id },
      });

      if (!existingInvoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      // Prevent modification of paid/cancelled/void invoices
      if (['PAID', 'CANCELLED', 'VOID'].includes(existingInvoice.status)) {
        return res.status(400).json({
          error: `Cannot modify invoice with status ${existingInvoice.status}`,
        });
      }

      const updateData: any = {};
      if (validatedData.status) updateData.status = validatedData.status;
      if (validatedData.dueDate) updateData.dueDate = new Date(validatedData.dueDate);
      if (validatedData.paymentTerms !== undefined) updateData.paymentTerms = validatedData.paymentTerms;
      if (validatedData.notes !== undefined) updateData.notes = validatedData.notes;

      const invoice = await prisma.invoice.update({
        where: { id },
        data: updateData,
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true, barcode: true },
              },
            },
          },
        },
      });

      logger.info(`Invoice updated: ${invoice.invoiceNumber}`, {
        invoiceId: id,
        status: validatedData.status,
        userId: (req as any).user?.id,
      });

      res.json({
        message: 'Invoice updated successfully',
        invoice,
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
// POST /api/invoices/:id/record-payment - Record payment against invoice
// ============================================================================
router.post(
  '/:id/record-payment',
  authenticate,
  authorize(['ADMIN', 'MANAGER', 'CASHIER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { amount, paymentMethod, reference, notes } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ error: 'Invalid payment amount' });
      }

      const invoice = await prisma.invoice.findUnique({
        where: { id },
        select: {
          id: true,
          invoiceNumber: true,
          customerId: true,
          supplierId: true,
          totalAmount: true,
          amountPaid: true,
          amountOutstanding: true,
          paymentStatus: true,
        },
      });

      if (!invoice) {
        return res.status(404).json({ error: 'Invoice not found' });
      }

      if (parseFloat(invoice.amountOutstanding.toString()) <= 0) {
        return res.status(400).json({ error: 'Invoice is already fully paid' });
      }

      const paymentAmount = Math.min(amount, parseFloat(invoice.amountOutstanding.toString()));

      // Update invoice with payment
      const result = await prisma.$transaction(async (tx: any) => {
        const newAmountPaid = invoice.amountPaid.plus(paymentAmount);
        const newAmountOutstanding = invoice.amountOutstanding.minus(paymentAmount);
        const isPaid = newAmountOutstanding.lte(0);

        const updatedInvoice = await tx.invoice.update({
          where: { id },
          data: {
            amountPaid: newAmountPaid,
            amountOutstanding: isPaid ? new Prisma.Decimal(0) : newAmountOutstanding,
            paymentStatus: isPaid ? 'PAID' : 'PARTIAL',
            status: isPaid && invoice.paymentStatus === 'UNPAID' ? 'PAID' : undefined,
          },
        });

        // Post to General Ledger
        const { postLedger } = await import('../services/accounting/postLedger.js');

        // Determine accounts based on customer vs supplier invoice
        const isCustomerInvoice = !!invoice.customerId;
        const contraAccountCode = isCustomerInvoice ? 'ACCOUNTS_RECEIVABLE' : 'ACCOUNTS_PAYABLE';

        const [cashAccount, contraAccount] = await Promise.all([
          tx.account.findFirst({ where: { code: 'CASH_IN_HAND' } }),
          tx.account.findFirst({ where: { code: contraAccountCode } }),
        ]);

        if (!cashAccount || !contraAccount) {
          throw new Error(`Required GL accounts not found`);
        }

        // Journal Entry for Invoice Payment:
        // Customer Invoice: Debit Cash, Credit AR
        // Supplier Invoice: Debit AP, Credit Cash
        if (isCustomerInvoice) {
          await postLedger({
            description: `Payment received for invoice ${invoice.invoiceNumber}`,
            date: new Date(),
            refType: 'invoice_payment',
            refId: invoice.id,
            entries: [
              {
                transactionId: '',
                accountId: cashAccount.id,
                amount: new Prisma.Decimal(paymentAmount),
                type: 'debit' as const,
                currency: 'UGX',
                refType: 'invoice_payment',
                refId: invoice.id,
              },
              {
                transactionId: '',
                accountId: contraAccount.id,
                amount: new Prisma.Decimal(paymentAmount),
                type: 'credit' as const,
                currency: 'UGX',
                refType: 'invoice_payment',
                refId: invoice.id,
              },
            ],
          });
        } else {
          await postLedger({
            description: `Payment made for invoice ${invoice.invoiceNumber}`,
            date: new Date(),
            refType: 'invoice_payment',
            refId: invoice.id,
            entries: [
              {
                transactionId: '',
                accountId: contraAccount.id,
                amount: new Prisma.Decimal(paymentAmount),
                type: 'debit' as const,
                currency: 'UGX',
                refType: 'invoice_payment',
                refId: invoice.id,
              },
              {
                transactionId: '',
                accountId: cashAccount.id,
                amount: new Prisma.Decimal(paymentAmount),
                type: 'credit' as const,
                currency: 'UGX',
                refType: 'invoice_payment',
                refId: invoice.id,
              },
            ],
          });
        }

        return updatedInvoice;
      });

      logger.info(`Payment recorded for invoice: ${invoice.invoiceNumber}`, {
        invoiceId: id,
        amount: paymentAmount,
        userId: (req as any).user?.id,
      });

      res.json({
        message: 'Payment recorded successfully',
        invoice: {
          ...result,
          amountPaid: result.amountPaid.toString(),
          amountOutstanding: result.amountOutstanding.toString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
