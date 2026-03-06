// Stock Movement Controller - HTTP request handlers
// Validates input, calls service layer, formats responses

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { MovementType } from './types.js';
import * as stockMovementService from './stockMovementService.js';
import { PaginationHelper } from '../../utils/pagination.js';

// Validation schemas
const RecordMovementSchema = z
  .object({
    productId: z.string().uuid(),
    batchId: z.string().uuid().optional().nullable(),
    movementType: z.enum(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'EXPIRY', 'RETURN']),
    quantity: z.number().refine((val) => val !== 0, { message: 'Quantity cannot be zero' }),
    notes: z.string().optional().nullable(),
    createdBy: z.string().uuid(),
  })
  .strict();

const ListMovementsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 100)),
  movementType: z
    .enum([
      'GOODS_RECEIPT',
      'SALE',
      'ADJUSTMENT_IN',
      'ADJUSTMENT_OUT',
      'TRANSFER_IN',
      'TRANSFER_OUT',
      'RETURN',
      'DAMAGE',
      'EXPIRY',
    ])
    .optional(),
  startDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
  endDate: z
    .string()
    .optional()
    .transform((val) => (val ? new Date(val) : undefined)),
});

// Async wrapper — catches thrown errors and forwards to Express error handler
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Record manual stock movement
 * POST /api/stock-movements
 */
export const recordMovement = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  // .parse() throws ZodError on failure — global handler formats it
  const validatedData = RecordMovementSchema.parse(req.body);
  const result = await stockMovementService.recordMovement(pool, validatedData);

  res.status(201).json({
    success: true,
    data: result,
    message: 'Stock movement recorded successfully',
  });
});

/**
 * Get movements by product
 * GET /api/stock-movements/product/:productId
 */
export const getMovementsByProduct = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { productId } = req.params;
  const pg = PaginationHelper.fromQuery(req.query as Record<string, string | undefined>, { limit: 100 });

  const result = await stockMovementService.getMovementsByProduct(pool, productId, pg.page, pg.limit);

  res.json({
    success: true,
    data: result.movements,
    pagination: PaginationHelper.envelope(pg, result.total),
  });
});

/**
 * Get movements by batch
 * GET /api/stock-movements/batch/:batchId
 */
export const getMovementsByBatch = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  const { batchId } = req.params;
  const pg = PaginationHelper.fromQuery(req.query as Record<string, string | undefined>, { limit: 100 });

  const result = await stockMovementService.getMovementsByBatch(pool, batchId, pg.page, pg.limit);

  res.json({
    success: true,
    data: result.movements,
    pagination: PaginationHelper.envelope(pg, result.total),
  });
});

/**
 * Get all movements with filters
 * GET /api/stock-movements
 */
export const getAllMovements = asyncHandler(async (req, res) => {
  const pool = req.tenantPool || globalPool;
  // .parse() throws ZodError on failure — global handler formats it
  const query = ListMovementsQuerySchema.parse(req.query);
  const result = await stockMovementService.getAllMovements(pool, query.page, query.limit, {
    movementType: query.movementType as MovementType | undefined,
    startDate: query.startDate,
    endDate: query.endDate,
  });

  const pg = { page: query.page, limit: query.limit, offset: (query.page - 1) * query.limit };

  res.json({
    success: true,
    data: result.movements,
    pagination: PaginationHelper.envelope(pg, result.total),
  });
});
