import type { Request, Response } from 'express';
import { z } from 'zod';
import { invoiceService } from './invoiceService.js';
import { pool as globalPool } from '../../db/pool.js';
import { CreateInvoiceSchema, RecordInvoicePaymentSchema } from '../../../../shared/zod/invoice.js';
import {
  asyncHandler,
  NotFoundError,
  ConflictError,
  ValidationError,
  AppError,
} from '../../middleware/errorHandler.js';

const UuidParamSchema = z.object({ id: z.string().uuid('ID must be a valid UUID') });

const ListInvoicesQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 1)),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v) : 50)),
  customerId: z.string().uuid().optional(),
  status: z.enum(['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED']).optional(),
});

export const invoiceController = {
  createInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateInvoiceSchema.parse(req.body);
    const userId = req.user?.id || null;

    try {
      const result = await invoiceService.createInvoice(pool, {
        customerId: data.customerId,
        saleId: data.saleId,
        issueDate: data.issueDate ? new Date(data.issueDate) : null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        notes: data.notes || null,
        createdById: userId,
        initialPaymentAmount: data.initialPaymentAmount || null,
      });

      res
        .status(201)
        .json({
          success: true,
          data: result.invoice,
          initialPayment: result.initialPayment,
          message: 'Invoice created',
        });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('already exists')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),

  getInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await invoiceService.getInvoiceById(pool, id);
    if (!result) throw new NotFoundError('Invoice');
    res.json({ success: true, data: result });
  }),

  listInvoices: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const q = ListInvoicesQuerySchema.parse(req.query);
    const result = await invoiceService.listInvoices(pool, q.page, q.limit, {
      customerId: q.customerId,
      status: q.status,
    });

    res.json({
      success: true,
      data: result.invoices,
      pagination: {
        page: q.page,
        limit: q.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / q.limit),
      },
    });
  }),

  addPayment: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const data = RecordInvoicePaymentSchema.parse(req.body);
    const userId = req.user?.id || null;

    const result = await invoiceService.addPayment(pool, id, {
      amount: data.amount,
      paymentMethod: data.paymentMethod,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      referenceNumber: data.referenceNumber || null,
      notes: data.notes || null,
      processedById: userId,
    });
    res
      .status(201)
      .json({
        success: true,
        data: result.invoice,
        payment: result.payment,
        message: 'Payment recorded',
      });
  }),

  listPayments: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const payments = await invoiceService.listPayments(pool, id);
    res.json({ success: true, data: payments });
  }),
};
