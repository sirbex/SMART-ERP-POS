/**
 * Batch Pricing Management API
 * 
 * Endpoints for:
 * - Auto-price computation and manual overrides
 * - Bulk price recalculation
 * - Cost change detection and smart prompts
 * - FIFO allocation preview
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import logger from '../utils/logger.js';
import { z } from 'zod';
import { BatchPricingService } from '../services/batchPricingService.js';
import { FIFOAllocationService } from '../services/fifoAllocationService.js';

const router = Router();

// ============================================
// Validation Schemas
// ============================================

const SetBatchPriceSchema = z.object({
  batchId: z.string().cuid('Batch ID must be a valid CUID'),
  manualPrice: z
    .number()
    .nonnegative('Price cannot be negative')
    .refine(
      (val) => val <= 9_999_999_999_999.99,
      'Price cannot exceed 9,999,999,999,999.99'
    )
    .refine(
      (val) => {
        const dp = val.toString().split('.')[1];
        return !dp || dp.length <= 2;
      },
      'Price precision cannot exceed 2 decimal places'
    )
    .optional(),
  autoPrice: z.boolean().default(true),
});

const BulkRecalculateSchema = z.object({
  productId: z.string().cuid('Product ID must be a valid CUID'),
});

const CostChangeAnalysisSchema = z.object({
  productId: z.string().cuid('Product ID must be a valid CUID'),
  newBatchCost: z
    .number()
    .nonnegative('Cost cannot be negative')
    .refine(
      (val) => val <= 9_999_999_999_999.99,
      'Cost cannot exceed 9,999,999,999,999.99'
    )
    .refine(
      (val) => {
        const dp = val.toString().split('.')[1];
        return !dp || dp.length <= 2;
      },
      'Cost precision cannot exceed 2 decimal places'
    ),
});

const CostChangeDecisionSchema = z.object({
  productId: z.string().cuid('Product ID must be a valid CUID'),
  autoRecalculate: z.boolean(),
  analysisId: z.string().optional(), // For audit trail
});

const FIFOPreviewSchema = z.object({
  productId: z.string().cuid('Product ID must be a valid CUID'),
  quantity: z
    .number()
    .positive('Quantity must be positive')
    .refine(
      (val) => val <= 999_999_999.9999,
      'Quantity cannot exceed 999,999,999.9999'
    )
    .refine(
      (val) => {
        const dp = val.toString().split('.')[1];
        return !dp || dp.length <= 4;
      },
      'Quantity precision cannot exceed 4 decimal places'
    ),
});

// ============================================
// Endpoints
// ============================================

/**
 * POST /api/batch-pricing/set-price
 * Set batch price (manual override or auto-compute)
 */
router.post(
  '/set-price',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = SetBatchPriceSchema.parse(req.body);

      const input = {
        batchId: validatedData.batchId,
        manualPrice: validatedData.manualPrice,
        useProductFormula: validatedData.autoPrice,
      };

      const sellingPrice = await BatchPricingService.setBatchPrice(input);

      logger.info('Batch price set', {
        userId: (req as any).user?.id,
        batchId: input.batchId,
        sellingPrice,
        manual: !!input.manualPrice,
      });

      res.json({
        success: true,
        message: input.manualPrice
          ? 'Batch price set manually'
          : 'Batch price auto-computed',
        data: {
          batchId: input.batchId,
          sellingPrice,
          autoPrice: !input.manualPrice,
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

/**
 * POST /api/batch-pricing/bulk-recalculate
 * Bulk recalculate prices for all auto-priced batches of a product
 */
router.post(
  '/bulk-recalculate',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = BulkRecalculateSchema.parse(req.body);

      const updatedCount = await BatchPricingService.bulkRecalculatePrices(
        validatedData.productId
      );

      logger.info('Bulk batch prices recalculated', {
        userId: (req as any).user?.id,
        productId: validatedData.productId,
        updatedCount,
      });

      res.json({
        success: true,
        message: `${updatedCount} batch prices recalculated`,
        data: {
          productId: validatedData.productId,
          updatedCount,
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

/**
 * POST /api/batch-pricing/analyze-cost-change
 * Analyze cost change and determine if recalculation prompt needed
 * Returns smart prompt data for frontend
 */
router.post(
  '/analyze-cost-change',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = CostChangeAnalysisSchema.parse(req.body);

      const analysis = await BatchPricingService.analyzeCostChange(
        validatedData.productId,
        validatedData.newBatchCost
      );

      if (!analysis) {
        return res.json({
          success: true,
          message: 'No significant cost change detected',
          data: null,
        });
      }

      // Format prompt message
      const direction = analysis.percentChange > 0 ? 'increased' : 'decreased';
      const absPercent = Math.abs(analysis.percentChange);

      const promptMessage = `🟡 Cost ${direction} by ${absPercent.toFixed(1)}%.\nRecalculate prices for ${analysis.affectedBatches} batch${analysis.affectedBatches === 1 ? '' : 'es'} automatically?`;

      res.json({
        success: true,
        message: 'Cost change analysis completed',
        data: {
          ...analysis,
          promptMessage,
          actions: [
            {
              label: 'Yes - Recalculate All',
              value: 'auto',
              variant: 'primary',
            },
            {
              label: 'Keep Manual Prices',
              value: 'manual',
              variant: 'secondary',
            },
          ],
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

/**
 * POST /api/batch-pricing/cost-change-decision
 * Process admin decision on cost change recalculation
 */
router.post(
  '/cost-change-decision',
  authenticate,
  authorize(['ADMIN', 'MANAGER']),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = CostChangeDecisionSchema.parse(req.body);

      if (validatedData.autoRecalculate) {
        const updatedCount = await BatchPricingService.bulkRecalculatePrices(
          validatedData.productId
        );

        logger.info('Cost change: auto-recalculation executed', {
          userId: (req as any).user?.id,
          productId: validatedData.productId,
          updatedCount,
        });

        res.json({
          success: true,
          message: `Prices recalculated for ${updatedCount} batches`,
          data: {
            action: 'auto',
            updatedCount,
          },
        });
      } else {
        logger.info('Cost change: manual prices kept', {
          userId: (req as any).user?.id,
          productId: validatedData.productId,
        });

        res.json({
          success: true,
          message: 'Manual prices kept',
          data: {
            action: 'manual',
            updatedCount: 0,
          },
        });
      }
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

/**
 * POST /api/batch-pricing/fifo-preview
 * Preview FIFO allocation for a sale without committing
 */
router.post(
  '/fifo-preview',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = FIFOPreviewSchema.parse(req.body);

      const preview = await FIFOAllocationService.previewAllocation(
        validatedData.productId,
        validatedData.quantity
      );

      res.json({
        success: true,
        message: 'FIFO allocation preview generated',
        data: preview,
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

/**
 * GET /api/batch-pricing/current-fifo-cost/:productId
 * Get current FIFO cost (next batch to be consumed)
 */
router.get(
  '/current-fifo-cost/:productId',
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { productId } = req.params;

      if (!productId || typeof productId !== 'string') {
        return res.status(400).json({
          error: 'Product ID is required',
        });
      }

      const fifoCost = await FIFOAllocationService.getCurrentFIFOCost(productId);

      if (fifoCost === null) {
        return res.json({
          success: true,
          message: 'No available batches for this product',
          data: {
            productId,
            fifoCost: null,
          },
        });
      }

      res.json({
        success: true,
        data: {
          productId,
          fifoCost,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
