import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { holdService } from './holdService.js';
import { CreateHoldOrderSchema } from '../../../../shared/zod/hold-order.schema.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import logger from '../../utils/logger.js';
import { asyncHandler } from '../../middleware/errorHandler.js';

/**
 * Hold Order Routes
 * API endpoints for "Put on Hold" and "Resume" cart functionality
 */

export function createHoldRoutes(pool: Pool): Router {
  const router = Router();

  // All hold routes require authentication + POS permission
  router.use(authenticate);
  router.use(requirePermission('pos.create'));

  /**
   * POST /api/pos/hold
   * Put cart on hold
   *
   * Body: CreateHoldOrderInput (validated with Zod)
   * Returns: Created hold order with items
   *
   * Business Rules:
   * - At least 1 item required
   * - NO stock movements created
   * - Expires in 24 hours by default
   */
  router.post(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.user?.id; // From auth middleware

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized - user ID required',
        });
      }

      // Inject userId from auth context
      const input = {
        ...req.body,
        userId,
      };

      const effectivePool = req.tenantPool || pool;
      const hold = await holdService.holdCart(effectivePool, input);

      res.status(201).json({
        success: true,
        data: hold,
        message: `Cart held as ${hold.holdNumber}`,
      });
    })
  );

  /**
   * GET /api/pos/hold
   * List held orders for current user/terminal
   *
   * Query Params:
   * - terminalId (optional): Filter by terminal
   *
   * Returns: Array of held orders with item counts
   */
  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'Unauthorized',
        });
      }

      const terminalId = req.query.terminalId as string | undefined;

      const effectivePool = req.tenantPool || pool;
      const holds = await holdService.listHolds(effectivePool, {
        userId,
        terminalId,
      });

      res.json({
        success: true,
        data: holds,
      });
    })
  );

  /**
   * GET /api/pos/hold/:id
   * Get held order by ID (for resume)
   *
   * Params:
   * - id: Hold order UUID
   *
   * Returns: Full hold order with items
   */
  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.id;

      const effectivePool = req.tenantPool || pool;
      const hold = await holdService.getHoldById(effectivePool, id);

      // Verify ownership (user can only load their own holds)
      if (hold.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden - not your hold order',
        });
      }

      res.json({
        success: true,
        data: hold,
      });
    })
  );

  /**
   * DELETE /api/pos/hold/:id
   * Delete held order (after resuming)
   *
   * Params:
   * - id: Hold order UUID
   *
   * Use Case: After loading hold into POS cart
   */
  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const { id } = req.params;
      const userId = req.user?.id;

      // Verify ownership before deletion
      const effectivePool = req.tenantPool || pool;
      const hold = await holdService.getHoldById(effectivePool, id);

      if (hold.userId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Forbidden - not your hold order',
        });
      }

      await holdService.deleteHold(effectivePool, id);

      res.json({
        success: true,
        message: 'Hold order deleted',
      });
    })
  );

  return router;
}
