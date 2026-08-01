import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { pool as globalPool } from '../../db/pool.js';
import { authenticate } from '../../middleware/auth.js';
import { requireAnyPermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { printJobsService } from './printJobsService.js';

const router = Router();
router.use(authenticate);

const StatusSchema = z.object({
  status: z.enum(['PENDING', 'PRINTING', 'PRINTED', 'ERROR']),
  errorMessage: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/print-jobs/pending
 * Local agent / FOH terminal pulls undelivered jobs (retry + first delivery).
 */
router.get(
  '/pending',
  requireAnyPermission(['restaurant.order', 'restaurant.kitchen', 'pos.sale', 'sales.read']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const jobs = await printJobsService.listPending(pool, limit);
    res.json({ success: true, data: jobs });
  }),
);

router.get(
  '/:id',
  requireAnyPermission(['restaurant.order', 'restaurant.kitchen', 'pos.sale', 'sales.read']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const job = await printJobsService.getById(pool, req.params.id);
    res.json({ success: true, data: job });
  }),
);

/**
 * PATCH /api/print-jobs/:id/status
 * Device reports PRINTING / PRINTED / ERROR after localhost:1811 delivery.
 */
router.patch(
  '/:id/status',
  requireAnyPermission(['restaurant.order', 'restaurant.kitchen', 'pos.sale', 'sales.read']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const body = StatusSchema.parse(req.body);
    const job = await printJobsService.markStatus(pool, req.params.id, body.status, {
      errorMessage: body.errorMessage,
    });
    res.json({ success: true, data: job });
  }),
);

/**
 * POST /api/print-jobs/:id/requeue
 * Kitchen/FOH reprint — put job back to PENDING for another silent delivery.
 */
router.post(
  '/:id/requeue',
  requireAnyPermission(['restaurant.order', 'restaurant.kitchen', 'pos.sale', 'sales.read']),
  asyncHandler(async (req: Request, res: Response) => {
    const pool = req.tenantPool || globalPool;
    const job = await printJobsService.requeue(pool, req.params.id);
    res.json({ success: true, data: job });
  }),
);

export default router;
