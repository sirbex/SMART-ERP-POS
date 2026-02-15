// Stock Movement Controller - HTTP request handlers
// Validates input, calls service layer, formats responses

import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { pool } from '../../db/pool.js';
import { MovementType } from './types.js';
import * as stockMovementService from './stockMovementService.js';
import logger from '../../utils/logger.js';

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

/**
 * Record manual stock movement
 * POST /api/stock-movements
 */
export async function recordMovement(req: Request, res: Response, next: NextFunction) {
  try {
    const validatedData = RecordMovementSchema.parse(req.body);
    const result = await stockMovementService.recordMovement(pool, validatedData);

    res.status(201).json({
      success: true,
      data: result,
      message: 'Stock movement recorded successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors,
      });
    }

    logger.error('Error recording stock movement', { error });
    next(error);
  }
}

/**
 * Get movements by product
 * GET /api/stock-movements/product/:productId
 */
export async function getMovementsByProduct(req: Request, res: Response, next: NextFunction) {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;

    const result = await stockMovementService.getMovementsByProduct(pool, productId, page, limit);

    res.json({
      success: true,
      data: result.movements,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error('Error getting product movements', { error, productId: req.params.productId });
    next(error);
  }
}

/**
 * Get movements by batch
 * GET /api/stock-movements/batch/:batchId
 */
export async function getMovementsByBatch(req: Request, res: Response, next: NextFunction) {
  try {
    const { batchId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;

    const result = await stockMovementService.getMovementsByBatch(pool, batchId, page, limit);

    res.json({
      success: true,
      data: result.movements,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit),
      },
    });
  } catch (error) {
    logger.error('Error getting batch movements', { error, batchId: req.params.batchId });
    next(error);
  }
}

/**
 * Get all movements with filters
 * GET /api/stock-movements
 */
export async function getAllMovements(req: Request, res: Response, next: NextFunction) {
  try {
    const query = ListMovementsQuerySchema.parse(req.query);
    const result = await stockMovementService.getAllMovements(pool, query.page, query.limit, {
      movementType: query.movementType as MovementType | undefined,
      startDate: query.startDate,
      endDate: query.endDate,
    });

    res.json({
      success: true,
      data: result.movements,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: error.errors,
      });
    }

    logger.error('Error getting movements', { error });
    next(error);
  }
}
