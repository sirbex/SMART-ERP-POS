import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { inventoryService } from './inventoryService.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import { stockCountRoutes } from './stockCountRoutes.js';

// Validation schemas
const AdjustInventorySchema = z
  .object({
    productId: z.string().uuid('Invalid product ID'),
    adjustment: z
      .number()
      .refine((val) => val !== 0, {
        message: 'Adjustment cannot be zero',
      }),
    reason: z.string().min(5, 'Reason must be at least 5 characters'),
    userId: z.string().uuid('Invalid user ID'),
  })
  .strict();

const GetBatchesQuerySchema = z.object({
  productId: z.string().uuid(),
});

const ExpiryQuerySchema = z.object({
  daysThreshold: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 30)),
});

export const inventoryController = {
  /**
   * Get all batches for a product
   */
  async getBatchesByProduct(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { productId } = GetBatchesQuerySchema.parse(req.query);
      const batches = await inventoryService.getBatchesByProduct(pool, productId);

      res.json({
        success: true,
        data: batches,
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Invalid query parameters',
          details: error.errors,
        });
        return;
      }

      console.error('Error getting batches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get batches',
      });
    }
  },

  /**
   * Get batches expiring soon
   */
  async getBatchesExpiringSoon(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { daysThreshold } = ExpiryQuerySchema.parse(req.query);
      const batches = await inventoryService.getBatchesExpiringSoon(pool, daysThreshold);

      res.json({
        success: true,
        data: batches,
        message: `Found ${batches.length} batches expiring within ${daysThreshold} days`,
      });
    } catch (error: any) {
      console.error('Error getting expiring batches:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get expiring batches',
      });
    }
  },

  /**
   * Get stock levels for all products
   */
  async getStockLevels(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const stockLevels = await inventoryService.getStockLevels(pool);

      res.json({
        success: true,
        data: stockLevels,
      });
    } catch (error: any) {
      console.error('Error getting stock levels:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get stock levels',
      });
    }
  },

  /**
   * Get stock level for specific product
   */
  async getStockLevelByProduct(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { productId } = req.params;
      const stockLevel = await inventoryService.getStockLevelByProduct(pool, productId);

      res.json({
        success: true,
        data: stockLevel,
      });
    } catch (error: any) {
      console.error('Error getting stock level:', error);

      if (error.message.includes('not found')) {
        res.status(404).json({
          success: false,
          error: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        error: 'Failed to get stock level',
      });
    }
  },

  /**
   * Get products needing reorder
   */
  async getProductsNeedingReorder(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const products = await inventoryService.getProductsNeedingReorder(pool);

      res.json({
        success: true,
        data: products,
        message: `${products.length} products need reordering`,
      });
    } catch (error: any) {
      console.error('Error getting products needing reorder:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get products needing reorder',
      });
    }
  },

  /**
   * Adjust inventory quantity
   */
  async adjustInventory(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const validatedData = AdjustInventorySchema.parse(req.body);
      const result = await inventoryService.adjustInventory(
        pool,
        validatedData.productId,
        validatedData.adjustment,
        validatedData.reason,
        validatedData.userId
      );

      res.json({
        success: true,
        data: result,
        message: 'Inventory adjusted successfully',
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors,
        });
        return;
      }

      console.error('Error adjusting inventory:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to adjust inventory',
      });
    }
  },

  /**
   * Get inventory value
   */
  async getInventoryValue(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { productId } = req.query;
      const value = await inventoryService.getInventoryValue(pool, productId as string | undefined);

      res.json({
        success: true,
        data: value,
      });
    } catch (error: any) {
      console.error('Error getting inventory value:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get inventory value',
      });
    }
  },

  /**
   * Check if batch number exists
   */
  async checkBatchExists(req: Request, res: Response): Promise<void> {
    try {
      const pool = req.tenantPool || globalPool;
      const { batchNumber } = req.query;

      if (!batchNumber || typeof batchNumber !== 'string') {
        res.status(400).json({
          success: false,
          error: 'Batch number is required',
        });
        return;
      }

      const result = await pool.query(
        'SELECT EXISTS(SELECT 1 FROM inventory_batches WHERE batch_number = $1)',
        [batchNumber]
      );

      res.json({
        success: true,
        exists: result.rows[0].exists,
      });
    } catch (error: any) {
      console.error('Error checking batch exists:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check batch',
      });
    }
  },
};

// Routes
export const inventoryRoutes = Router();

// View routes - all authenticated users
inventoryRoutes.get('/batches', authenticate, inventoryController.getBatchesByProduct);
inventoryRoutes.get('/batches/exists', authenticate, inventoryController.checkBatchExists);
inventoryRoutes.get('/batches/expiring', authenticate, inventoryController.getBatchesExpiringSoon);
inventoryRoutes.get('/stock-levels', authenticate, inventoryController.getStockLevels);
inventoryRoutes.get(
  '/stock-levels/:productId',
  authenticate,
  inventoryController.getStockLevelByProduct
);
inventoryRoutes.get('/reorder', authenticate, inventoryController.getProductsNeedingReorder);
inventoryRoutes.get('/value', authenticate, inventoryController.getInventoryValue);

// Adjustment route - ADMIN, MANAGER only
inventoryRoutes.post(
  '/adjust',
  authenticate,
  authorize('ADMIN', 'MANAGER'),
  inventoryController.adjustInventory
);

// Stock count routes - nested under /api/inventory/stockcounts
// All routes require authentication (handled in stockCountRoutes)
inventoryRoutes.use('/stockcounts', stockCountRoutes);
