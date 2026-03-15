/**
 * @module StockCountRoutes
 * @description Express routes for Physical Counting (Stocktake) API
 */

import { Router } from 'express';
import { stockCountController } from './stockCountController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = Router();

/**
 * All routes require authentication
 */
router.use(authenticate);

/**
 * POST /api/inventory/stockcounts
 * Create new stock count
 */
router.post('/', requirePermission('inventory.manage'), stockCountController.createStockCount);

/**
 * GET /api/inventory/stockcounts
 * List stock counts with optional filters
 */
router.get('/', requirePermission('inventory.read'), stockCountController.listStockCounts);

/**
 * GET /api/inventory/stockcounts/:id
 * Get stock count by ID with lines
 */
router.get('/:id', requirePermission('inventory.read'), stockCountController.getStockCount);

/**
 * POST /api/inventory/stockcounts/:id/lines
 * Add or update count line
 */
router.post(
  '/:id/lines',
  requirePermission('inventory.manage'),
  stockCountController.updateCountLine
);

/**
 * POST /api/inventory/stockcounts/:id/validate
 * Validate and reconcile stock count
 */
router.post(
  '/:id/validate',
  requirePermission('inventory.manage'),
  stockCountController.validateStockCount
);

/**
 * POST /api/inventory/stockcounts/:id/cancel
 * Cancel stock count
 */
router.post(
  '/:id/cancel',
  requirePermission('inventory.manage'),
  stockCountController.cancelStockCount
);

/**
 * DELETE /api/inventory/stockcounts/:id
 * Delete stock count (only if in draft/cancelled state)
 */
router.delete('/:id', requirePermission('inventory.manage'), stockCountController.deleteStockCount);

export const stockCountRoutes = router;
