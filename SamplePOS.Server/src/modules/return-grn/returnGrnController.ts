/**
 * Return GRN Controller
 * 
 * HTTP handlers for Return Goods Receipt Note operations.
 */

import type { Request, Response } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { returnGrnService } from './returnGrnService.js';
import {
  asyncHandler,
  NotFoundError,
  ConflictError,
  ValidationError,
  AppError,
} from '../../middleware/errorHandler.js';

// ============================================================
// Schemas
// ============================================================

const UuidParam = z.object({ id: z.string().uuid() });

const CreateReturnGrnSchema = z.object({
  grnId: z.string().uuid('GRN ID must be a valid UUID'),
  returnDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  reason: z.string().min(1, 'Reason is required').max(500),
  lines: z.array(z.object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().nullish(),
    uomId: z.string().uuid().nullish(),
    quantity: z.coerce.number().positive('Quantity must be positive'),
    unitCost: z.coerce.number().nonnegative('Unit cost must be non-negative'),
  })).min(1, 'At least one line item is required'),
}).strict();

const ListQuerySchema = z.object({
  page: z.string().optional().transform(v => (v ? parseInt(v) : 1)),
  limit: z.string().optional().transform(v => (v ? parseInt(v) : 50)),
  grnId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'POSTED']).optional(),
});

// ============================================================
// Controller
// ============================================================

export const returnGrnController = {

  create: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const data = CreateReturnGrnSchema.parse(req.body);
    const userId = req.user?.id;
    if (!userId) throw new ValidationError('Authentication required');

    try {
      const result = await returnGrnService.create(pool, {
        grnId: data.grnId,
        returnDate: data.returnDate,
        reason: data.reason,
        createdBy: userId,
        lines: data.lines,
      });

      res.status(201).json({
        success: true,
        data: result,
        message: `Return GRN ${result.returnGrn.returnGrnNumber} created as Draft`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      if (msg.includes('Cannot return') || msg.includes('Insufficient')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),

  post: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParam.parse(req.params);

    try {
      const result = await returnGrnService.post(pool, id);
      res.json({
        success: true,
        data: result,
        message: `Return GRN ${result.returnGrnNumber} posted — stock reduced`,
      });
    } catch (error: unknown) {
      if (error instanceof AppError) throw error;
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) throw new NotFoundError(msg);
      if (msg.includes('Cannot return') || msg.includes('Insufficient') || msg.includes('Only DRAFT')) throw new ConflictError(msg);
      throw new ValidationError(msg);
    }
  }),

  getById: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParam.parse(req.params);

    const result = await returnGrnService.getById(pool, id);
    if (!result) throw new NotFoundError('Return GRN not found');

    res.json({ success: true, data: result });
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const q = ListQuerySchema.parse(req.query);

    const result = await returnGrnService.list(pool, {
      grnId: q.grnId,
      supplierId: q.supplierId,
      status: q.status,
      page: q.page,
      limit: q.limit,
    });

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        page: q.page,
        limit: q.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / q.limit),
      },
    });
  }),

  getReturnableItems: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParam.parse(req.params);

    const items = await returnGrnService.getReturnableItems(pool, id);
    res.json({ success: true, data: items });
  }),

  getByGrnId: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = UuidParam.parse(req.params);

    const returns = await returnGrnService.getByGrnId(pool, id);
    res.json({ success: true, data: returns });
  }),
};
