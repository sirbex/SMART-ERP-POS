/**
 * Loss & Quarantine routes — Phase 2B aging workqueue
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';
import { getQuarantineAging } from './quarantineAgingService.js';

const router = Router();

router.use(authenticate);

const AgingQuerySchema = z.object({
  minAgeDays: z.coerce.number().int().min(0).max(3650).optional(),
  storeType: z.enum(['DAMAGE', 'EXPIRED', 'RETURN']).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const DisposeSchema = z.object({
  storeLocationId: z.string().uuid(),
  productId: z.string().uuid(),
  productLotId: z.string().uuid(),
  quantity: z.number().positive(),
  reason: z.enum(['DAMAGE', 'EXPIRY', 'SHRINKAGE', 'WRITE_OFF', 'PHYSICAL_COUNT']).optional(),
  memo: z.string().max(2000).optional(),
  unitCost: z.number().positive().optional(),
});

const ReverseSchema = z.object({
  reason: z.string().max(2000).optional(),
});

router.get(
  '/quarantine-aging',
  requirePermission('inventory.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const q = AgingQuerySchema.parse(req.query);
    const data = await getQuarantineAging(pool, q);
    res.json({ success: true, data });
  }),
);

router.post(
  '/dispose',
  requirePermission('inventory.adjust'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = DisposeSchema.parse(req.body);
    const userId = req.user!.id;
    const { disposeFromQuarantine } = await import('./lossDisposalService.js');
    const data = await disposeFromQuarantine(pool, { ...body, userId });
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/dispose/:id/reverse',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = ReverseSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    const { reverseDisposal } = await import('./lossDisposalService.js');
    const data = await reverseDisposal(pool, {
      documentId: req.params.id,
      userId,
      reason: body.reason,
    });
    res.json({ success: true, data });
  }),
);

export const lossQuarantineRoutes = router;
