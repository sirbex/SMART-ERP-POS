/**
 * @module StockCountRoutes
 * @description Express routes for Physical Counting (Stocktake) API
 */

import { Router } from 'express';
import { stockCountController } from './stockCountController.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

/**
 * All routes require authentication
 */
router.use(authenticate);

/**
 * POST /api/inventory/stockcounts
 * Create new stock count
 * 
 * Body: CreateStockCountSchema
 * {
 *   name: string
 *   locationId?: string
 *   notes?: string
 *   includeAllProducts?: boolean
 *   productIds?: string[]
 *   categoryId?: string
 * }
 */
router.post('/', stockCountController.createStockCount);

/**
 * GET /api/inventory/stockcounts
 * List stock counts with optional filters
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 20)
 * - state: string (draft|counting|validating|done|cancelled)
 * - createdById: string (UUID)
 */
router.get('/', stockCountController.listStockCounts);

/**
 * GET /api/inventory/stockcounts/:id
 * Get stock count by ID with lines
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 100)
 */
router.get('/:id', stockCountController.getStockCount);

/**
 * POST /api/inventory/stockcounts/:id/lines
 * Add or update count line
 * 
 * Body: UpdateCountLineSchema
 * {
 *   productId: string
 *   batchId?: string
 *   countedQty: number
 *   uom: string
 *   notes?: string
 * }
 */
router.post('/:id/lines', stockCountController.updateCountLine);

/**
 * POST /api/inventory/stockcounts/:id/validate
 * Validate and reconcile stock count
 * Creates stock movements for differences
 * 
 * Body: ValidateStockCountSchema
 * {
 *   allowNegativeAdjustments?: boolean
 *   createMissingBatches?: boolean
 *   notes?: string
 * }
 */
router.post('/:id/validate', stockCountController.validateStockCount);

/**
 * POST /api/inventory/stockcounts/:id/cancel
 * Cancel stock count
 * 
 * Body:
 * {
 *   notes?: string
 * }
 */
router.post('/:id/cancel', stockCountController.cancelStockCount);

/**
 * DELETE /api/inventory/stockcounts/:id
 * Delete stock count (only if in draft/cancelled state)
 */
router.delete('/:id', stockCountController.deleteStockCount);

export const stockCountRoutes = router;
