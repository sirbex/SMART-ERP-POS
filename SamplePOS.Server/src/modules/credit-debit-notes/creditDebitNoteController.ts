/**
 * Credit/Debit Note Controller
 * 
 * HTTP handlers for credit/debit note operations.
 * Separates customer (AR) and supplier (AP) endpoints.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { creditDebitNoteService, supplierCreditDebitNoteService } from './creditDebitNoteService.js';
import {
  CreateCustomerCreditNoteSchema,
  CreateCustomerDebitNoteSchema,
  CreateSupplierCreditNoteSchema,
  CreateSupplierDebitNoteSchema,
  PostNoteSchema,
} from '../../../../shared/zod/creditDebitNote.js';
import {
  asyncHandler,
  NotFoundError,
  ConflictError,
  ValidationError,
  AppError,
} from '../../middleware/errorHandler.js';

const UuidParamSchema = z.object({ id: z.string().uuid() });

const CancelNoteBodySchema = z.object({
  reason: z.string().min(1, 'Cancellation reason is required').max(500),
}).strict();

const ListNotesQuerySchema = z.object({
  page: z.string().optional().transform(v => (v ? parseInt(v) : 1)),
  limit: z.string().optional().transform(v => (v ? parseInt(v) : 50)),
  documentType: z.enum(['CREDIT_NOTE', 'DEBIT_NOTE']).optional(),
  customerId: z.string().uuid().optional(),
  referenceInvoiceId: z.string().uuid().optional(),
  status: z.string().optional(),
});

const ListSupplierNotesQuerySchema = z.object({
  page: z.string().optional().transform(v => (v ? parseInt(v) : 1)),
  limit: z.string().optional().transform(v => (v ? parseInt(v) : 50)),
  documentType: z.enum(['SUPPLIER_CREDIT_NOTE', 'SUPPLIER_DEBIT_NOTE']).optional(),
  supplierId: z.string().uuid().optional(),
  referenceInvoiceId: z.string().uuid().optional(),
  status: z.string().optional(),
});

// ============================================================
// CUSTOMER SIDE
// ============================================================

export const creditDebitNoteController = {

  createCreditNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateCustomerCreditNoteSchema.parse(req.body);

    try {
      const result = await creditDebitNoteService.createCreditNote(pool, data);
      res.status(201).json({
        success: true,
        data: { note: result.note, lineItems: result.lineItems },
        message: `Credit note ${result.note.invoiceNumber} created as Draft`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      if (msg.includes('exceed')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),

  createDebitNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateCustomerDebitNoteSchema.parse(req.body);

    try {
      const result = await creditDebitNoteService.createDebitNote(pool, data);
      res.status(201).json({
        success: true,
        data: { note: result.note, lineItems: result.lineItems },
        message: `Debit note ${result.note.invoiceNumber} created as Draft`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      throw new ValidationError(msg);
    }
  }),

  postNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);

    try {
      const note = await creditDebitNoteService.postNote(pool, id);
      res.json({
        success: true,
        data: note,
        message: `${note.documentType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} note ${note.invoiceNumber} posted`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      throw new ValidationError(msg);
    }
  }),

  listNotes: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const q = ListNotesQuerySchema.parse(req.query);
    const result = await creditDebitNoteService.listNotes(pool, {
      documentType: q.documentType,
      customerId: q.customerId,
      referenceInvoiceId: q.referenceInvoiceId,
      status: q.status,
      page: q.page,
      limit: q.limit,
    });

    res.json({
      success: true,
      data: result.notes,
      pagination: {
        page: q.page,
        limit: q.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / q.limit),
      },
    });
  }),

  getNoteById: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await creditDebitNoteService.getNoteById(pool, id);
    if (!result) throw new NotFoundError('Credit/Debit note');
    res.json({ success: true, data: { note: result.note, lineItems: result.lineItems } });
  }),

  getNotesForInvoice: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await creditDebitNoteService.getNotesForInvoice(pool, id);
    res.json({ success: true, data: result });
  }),

  cancelNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const { reason } = CancelNoteBodySchema.parse(req.body);

    try {
      const note = await creditDebitNoteService.cancelNote(pool, id, reason);
      res.json({
        success: true,
        data: note,
        message: `${note.documentType === 'CREDIT_NOTE' ? 'Credit' : 'Debit'} note ${note.invoiceNumber} cancelled with GL reversal`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      if (msg.includes('Only posted')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),
};

// ============================================================
// SUPPLIER SIDE
// ============================================================

export const supplierCreditDebitNoteController = {

  createCreditNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateSupplierCreditNoteSchema.parse(req.body);

    try {
      const result = await supplierCreditDebitNoteService.createCreditNote(pool, data);
      res.status(201).json({
        success: true,
        data: { note: result.note, lineItems: result.lineItems },
        message: `Supplier credit note ${result.note.invoiceNumber} created as Draft`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      if (msg.includes('exceed')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),

  createDebitNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateSupplierDebitNoteSchema.parse(req.body);

    try {
      const result = await supplierCreditDebitNoteService.createDebitNote(pool, data);
      res.status(201).json({
        success: true,
        data: { note: result.note, lineItems: result.lineItems },
        message: `Supplier debit note ${result.note.invoiceNumber} created as Draft`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      throw new ValidationError(msg);
    }
  }),

  postNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);

    try {
      const note = await supplierCreditDebitNoteService.postNote(pool, id);
      res.json({
        success: true,
        data: note,
        message: `Supplier ${note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'credit' : 'debit'} note ${note.invoiceNumber} posted`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      throw new ValidationError(msg);
    }
  }),

  listNotes: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const q = ListSupplierNotesQuerySchema.parse(req.query);
    const result = await supplierCreditDebitNoteService.listNotes(pool, {
      documentType: q.documentType,
      supplierId: q.supplierId,
      referenceInvoiceId: q.referenceInvoiceId,
      status: q.status,
      page: q.page,
      limit: q.limit,
    });

    res.json({
      success: true,
      data: result.notes,
      pagination: {
        page: q.page,
        limit: q.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / q.limit),
      },
    });
  }),

  getNoteById: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const result = await supplierCreditDebitNoteService.getNoteById(pool, id);
    if (!result) throw new NotFoundError('Supplier credit/debit note');
    res.json({ success: true, data: { note: result.note, lineItems: result.lineItems } });
  }),

  cancelNote: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParamSchema.parse(req.params);
    const { reason } = CancelNoteBodySchema.parse(req.body);

    try {
      const note = await supplierCreditDebitNoteService.cancelNote(pool, id, reason);
      res.json({
        success: true,
        data: note,
        message: `Supplier ${note.documentType === 'SUPPLIER_CREDIT_NOTE' ? 'credit' : 'debit'} note ${note.invoiceNumber} cancelled with GL reversal`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      if (msg.includes('Only posted')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),
};
