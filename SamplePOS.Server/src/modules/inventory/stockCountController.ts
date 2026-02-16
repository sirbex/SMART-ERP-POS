/**
 * @module StockCountController
 * @description HTTP handlers for Physical Counting (Stocktake) API
 * @architecture Controller layer - validation, HTTP handling, error responses
 */

import { Request, Response } from 'express';
import { stockCountService } from './stockCountService.js';
import { pool as globalPool } from '../../db/pool.js';
import {
  CreateStockCountSchema,
  UpdateCountLineSchema,
  ValidateStockCountSchema,
} from '../../../../shared/zod/stockCount.js';
import logger from '../../utils/logger.js';

export const stockCountController = {
  /**
   * POST /api/inventory/stockcounts
   * Create new stock count
   */
  async createStockCount(req: Request, res: Response) {
    try {
      const pool = req.tenantPool || globalPool;

      const userId = req.user?.id; // From JWT middleware

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - user ID not found',
        });
      }

      // Validate request body
      const validationResult = CreateStockCountSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;

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
    } catch (error) {
      logger.error('Failed to create stock count', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * GET /api/inventory/stockcounts/:id
   * Get stock count by ID with lines
   */
  async getStockCount(req: Request, res: Response) {
    try {
      const pool = req.tenantPool || globalPool;

      const { id } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 100;

      const result = await stockCountService.getStockCountWithLines(pool, id, page, limit);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Failed to get stock count', { error });

      if ((error as Error).message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: (error as Error).message,
        });
      }

      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * GET /api/inventory/stockcounts
   * List stock counts with filters
   */
  async listStockCounts(req: Request, res: Response) {
    try {
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
    } catch (error) {
      logger.error('Failed to list stock counts', { error });
      res.status(500).json({
        success: false,
        error: (error as Error).message,
      });
    }
  },

  /**
   * POST /api/inventory/stockcounts/:id/lines
   * Add or update count line
   */
  async updateCountLine(req: Request, res: Response) {
    try {
      const pool = req.tenantPool || globalPool;

      const { id: stockCountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - user ID not found',
        });
      }

      // Validate request body
      const validationResult = UpdateCountLineSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;

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
      logger.error('Failed to update count line', { error });

      const errorMsg = (error as Error).message;
      if (errorMsg.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: errorMsg,
        });
      }

      if (errorMsg.includes('state')) {
        return res.status(400).json({
          success: false,
          error: errorMsg,
        });
      }

      res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  },

  /**
   * POST /api/inventory/stockcounts/:id/validate
   * Validate and reconcile stock count
   */
  async validateStockCount(req: Request, res: Response) {
    try {
      const pool = req.tenantPool || globalPool;

      const { id: stockCountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - user ID not found',
        });
      }

      // Validate request body
      const validationResult = ValidateStockCountSchema.safeParse(req.body);

      if (!validationResult.success) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: validationResult.error.errors,
        });
      }

      const data = validationResult.data;

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
      logger.error('Failed to validate stock count', { error });

      const errorMsg = (error as Error).message;
      if (errorMsg.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: errorMsg,
        });
      }

      if (errorMsg.includes('state') || errorMsg.includes('Validation failed')) {
        return res.status(400).json({
          success: false,
          error: errorMsg,
        });
      }

      res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  },

  /**
   * POST /api/inventory/stockcounts/:id/cancel
   * Cancel stock count
   */
  async cancelStockCount(req: Request, res: Response) {
    try {
      const pool = req.tenantPool || globalPool;

      const { id: stockCountId } = req.params;
      const userId = req.user?.id;
      const { notes } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - user ID not found',
        });
      }

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
      logger.error('Failed to cancel stock count', { error });

      const errorMsg = (error as Error).message;
      if (errorMsg.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: errorMsg,
        });
      }

      if (errorMsg.includes('cancel')) {
        return res.status(400).json({
          success: false,
          error: errorMsg,
        });
      }

      res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  },

  /**
   * DELETE /api/inventory/stockcounts/:id
   * Delete stock count (only if in draft/cancelled state)
   */
  async deleteStockCount(req: Request, res: Response) {
    try {
      const pool = req.tenantPool || globalPool;

      const { id: stockCountId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - user ID not found',
        });
      }

      // Check state before deletion
      const stockCount = await stockCountService.getStockCountWithLines(pool, stockCountId, 1, 1);

      if (!['draft', 'cancelled'].includes(stockCount.stockCount.state)) {
        return res.status(400).json({
          success: false,
          error: `Cannot delete stock count in ${stockCount.stockCount.state} state. Only draft or cancelled counts can be deleted.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Import repository to access deleteStockCount
        const { stockCountRepository } = await import('./stockCountRepository.js');
        await stockCountRepository.deleteStockCount(client, stockCountId);

        await client.query('COMMIT');

        logger.info('Stock count deleted via API', { stockCountId, userId });

        res.json({
          success: true,
          message: 'Stock count deleted successfully',
        });
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      logger.error('Failed to delete stock count', { error });

      const errorMsg = (error as Error).message;
      if (errorMsg.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: errorMsg,
        });
      }

      res.status(500).json({
        success: false,
        error: errorMsg,
      });
    }
  },
};
