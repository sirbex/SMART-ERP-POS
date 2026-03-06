/**
 * @module StockCountController
 * @description HTTP handlers for Physical Counting (Stocktake) API
 * @architecture Controller layer - validation, HTTP handling, error responses
 */

import { Request, Response } from 'express';
import { stockCountService } from './stockCountService.js';
import { pool as globalPool } from '../../db/pool.js';
import { UnitOfWork } from '../../db/unitOfWork.js';
import {
  CreateStockCountSchema,
  UpdateCountLineSchema,
  ValidateStockCountSchema,
} from '../../../../shared/zod/stockCount.js';
import logger from '../../utils/logger.js';
import { asyncHandler, AppError, NotFoundError, ValidationError, UnauthorizedError } from '../../middleware/errorHandler.js';

/** Rethrow known business errors as appropriate AppError subclasses */
function mapBusinessError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const msg = error instanceof Error ? error.message : String(error);
  if (msg.includes('not found')) throw new NotFoundError(msg);
  if (msg.includes('state') || msg.includes('cancel') || msg.includes('Validation failed')) {
    throw new ValidationError(msg);
  }
  throw error;
}

export const stockCountController = {
  /**
   * POST /api/inventory/stockcounts
   * Create new stock count
   */
  createStockCount: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Unauthorized - user ID not found');

    const data = CreateStockCountSchema.parse(req.body);

    const result = await stockCountService.createStockCount(pool, {
      name: data.name,
      locationId: data.locationId,
      notes: data.notes,
      includeAllProducts: data.includeAllProducts,
      productIds: data.productIds,
      categoryId: data.categoryId,
      createdById: userId,
    });

    logger.info('Stock count created via API', {
      stockCountId: result.stockCount.id,
      userId,
    });

    res.status(201).json({
      success: true,
      data: result,
      message: 'Stock count created successfully',
    });
  }),

  /**
   * GET /api/inventory/stockcounts/:id
   * Get stock count by ID with lines
   */
  getStockCount: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;

    try {
      const result = await stockCountService.getStockCountWithLines(pool, id, page, limit);
      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      mapBusinessError(error);
    }
  }),

  /**
   * GET /api/inventory/stockcounts
   * List stock counts with filters
   */
  listStockCounts: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const state = req.query.state as string | undefined;
    const createdById = req.query.createdById as string | undefined;

    const result = await stockCountService.listStockCounts(pool, {
      state,
      createdById,
      page,
      limit,
    });

    res.json({
      success: true,
      data: result,
    });
  }),

  /**
   * POST /api/inventory/stockcounts/:id/lines
   * Add or update count line
   */
  updateCountLine: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id: stockCountId } = req.params;
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Unauthorized - user ID not found');

    const data = UpdateCountLineSchema.parse(req.body);

    try {
      const line = await stockCountService.updateCountLine(pool, {
        stockCountId,
        productId: data.productId,
        batchId: data.batchId,
        countedQty: data.countedQty,
        uom: data.uom,
        notes: data.notes,
        userId,
      });

      logger.info('Count line updated via API', {
        stockCountId,
        lineId: line.id,
        userId,
      });

      res.json({
        success: true,
        data: line,
        message: 'Count line updated successfully',
      });
    } catch (error) {
      mapBusinessError(error);
    }
  }),

  /**
   * POST /api/inventory/stockcounts/:id/validate
   * Validate and reconcile stock count
   */
  validateStockCount: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id: stockCountId } = req.params;
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Unauthorized - user ID not found');

    const data = ValidateStockCountSchema.parse(req.body);

    try {
      const result = await stockCountService.validateStockCount(pool, {
        stockCountId,
        allowNegativeAdjustments: data.allowNegativeAdjustments,
        createMissingBatches: data.createMissingBatches,
        notes: data.notes,
        validatedById: userId,
      });

      logger.info('Stock count validated via API', {
        stockCountId,
        adjustmentsCreated: result.adjustmentsCreated,
        userId,
      });

      res.json({
        success: true,
        data: result,
        message: 'Stock count validated and reconciled successfully',
      });
    } catch (error) {
      mapBusinessError(error);
    }
  }),

  /**
   * POST /api/inventory/stockcounts/:id/cancel
   * Cancel stock count
   */
  cancelStockCount: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id: stockCountId } = req.params;
    const userId = req.user?.id;
    const { notes } = req.body;
    if (!userId) throw new UnauthorizedError('Unauthorized - user ID not found');

    try {
      const result = await stockCountService.cancelStockCount(
        pool,
        stockCountId,
        notes || null,
        userId
      );

      logger.info('Stock count cancelled via API', { stockCountId, userId });

      res.json({
        success: true,
        data: result,
        message: 'Stock count cancelled successfully',
      });
    } catch (error) {
      mapBusinessError(error);
    }
  }),

  /**
   * DELETE /api/inventory/stockcounts/:id
   * Delete stock count (only if in draft/cancelled state)
   */
  deleteStockCount: asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const { id: stockCountId } = req.params;
    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedError('Unauthorized - user ID not found');

    // Check state before deletion
    const stockCount = await stockCountService.getStockCountWithLines(pool, stockCountId, 1, 1);

    if (!['draft', 'cancelled'].includes(stockCount.stockCount.state)) {
      throw new ValidationError(
        `Cannot delete stock count in ${stockCount.stockCount.state} state. Only draft or cancelled counts can be deleted.`
      );
    }

    await UnitOfWork.run(pool, async (client) => {
      const { stockCountRepository } = await import('./stockCountRepository.js');
      await stockCountRepository.deleteStockCount(client, stockCountId);
    });

    logger.info('Stock count deleted via API', { stockCountId, userId });

    res.json({
      success: true,
      message: 'Stock count deleted successfully',
    });
  }),
};
