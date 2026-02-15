import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { holdService } from './holdService.js';
import { CreateHoldOrderSchema } from '../../../../shared/zod/hold-order.schema.js';
import { authenticate } from '../../middleware/auth.js';
import logger from '../../utils/logger.js';

/**
 * Hold Order Routes
 * API endpoints for "Put on Hold" and "Resume" cart functionality
 */

export function createHoldRoutes(pool: Pool): Router {
    const router = Router();

    // All hold routes require authentication
    router.use(authenticate);

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
    router.post('/', async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.id; // From auth middleware

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

            const hold = await holdService.holdCart(pool, input);

            res.status(201).json({
                success: true,
                data: hold,
                message: `Cart held as ${hold.holdNumber}`,
            });
        } catch (error: any) {
            logger.error('Failed to hold cart', { error: error.message, body: req.body });

            if (error.name === 'ZodError') {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: error.errors,
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to hold cart',
            });
        }
    });

    /**
     * GET /api/pos/hold
     * List held orders for current user/terminal
     * 
     * Query Params:
     * - terminalId (optional): Filter by terminal
     * 
     * Returns: Array of held orders with item counts
     */
    router.get('/', async (req: Request, res: Response) => {
        try {
            const userId = (req as any).user?.id;

            if (!userId) {
                return res.status(401).json({
                    success: false,
                    error: 'Unauthorized',
                });
            }

            const terminalId = req.query.terminalId as string | undefined;

            const holds = await holdService.listHolds(pool, {
                userId,
                terminalId,
            });

            res.json({
                success: true,
                data: holds,
            });
        } catch (error: any) {
            logger.error('Failed to list holds', { error: error.message });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to list holds',
            });
        }
    });

    /**
     * GET /api/pos/hold/:id
     * Get held order by ID (for resume)
     * 
     * Params:
     * - id: Hold order UUID
     * 
     * Returns: Full hold order with items
     */
    router.get('/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const userId = (req as any).user?.id;

            const hold = await holdService.getHoldById(pool, id);

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
        } catch (error: any) {
            logger.error('Failed to get hold', { error: error.message, holdId: req.params.id });

            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: 'Hold order not found',
                });
            }

            if (error.message.includes('expired')) {
                return res.status(410).json({
                    success: false,
                    error: 'Hold order has expired',
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get hold',
            });
        }
    });

    /**
     * DELETE /api/pos/hold/:id
     * Delete held order (after resuming)
     * 
     * Params:
     * - id: Hold order UUID
     * 
     * Use Case: After loading hold into POS cart
     */
    router.delete('/:id', async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const userId = (req as any).user?.id;

            // Verify ownership before deletion
            const hold = await holdService.getHoldById(pool, id);

            if (hold.userId !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden - not your hold order',
                });
            }

            await holdService.deleteHold(pool, id);

            res.json({
                success: true,
                message: 'Hold order deleted',
            });
        } catch (error: any) {
            logger.error('Failed to delete hold', { error: error.message, holdId: req.params.id });

            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: 'Hold order not found',
                });
            }

            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete hold',
            });
        }
    });

    return router;
}
