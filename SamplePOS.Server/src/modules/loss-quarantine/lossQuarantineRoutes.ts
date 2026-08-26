/**
 * Loss & Quarantine routes — Phase 2B aging + LQ13 soft quarantine
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';
import { getQuarantineAging } from './quarantineAgingService.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

const router = Router();

router.use(authenticate);

const AgingQuerySchema = z.object({
  minAgeDays: z.coerce.number().int().min(0).max(3650).optional(),
  storeType: z.enum(['DAMAGE', 'EXPIRED', 'RETURN']).optional(),
  limit: z.coerce.number().int().min(1).max(2000).optional(),
});

const DisposeSchema = z.object({
  storeLocationId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid(),
  productLotId: z.string().uuid().optional().nullable(),
  inventoryBatchId: z.string().uuid().optional().nullable(),
  quantity: z.number().positive(),
  reason: z.enum(['DAMAGE', 'EXPIRY', 'SHRINKAGE', 'WRITE_OFF', 'PHYSICAL_COUNT']).optional(),
  memo: z.string().max(2000).optional(),
  unitCost: z.number().positive().optional(),
  quarantineMode: z.enum(['HARD', 'SOFT']).optional(),
});

const SoftQuarantineSchema = z.object({
  inventoryBatchId: z.string().uuid(),
  reason: z.enum(['EXPIRED', 'DAMAGE']),
  memo: z.string().max(2000).optional(),
});

const FromExpiringReportSchema = z.object({
  inventoryBatchId: z.string().uuid(),
  memo: z.string().max(2000).optional(),
});

const FromExpiringReportBulkSchema = z.object({
  inventoryBatchIds: z.array(z.string().uuid()).min(1).max(100),
  memo: z.string().max(2000).optional(),
});

const ReverseSchema = z.object({
  reason: z.string().max(2000).optional(),
});

const AutoDisposeProcessSchema = z.object({
  force: z.boolean().optional(),
  dryRun: z.boolean().optional(),
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

router.get(
  '/auto-dispose/preview',
  requirePermission('inventory.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { previewQuarantineAutoDispose } = await import('./quarantineAutoDisposeService.js');
    const data = await previewQuarantineAutoDispose(pool);
    res.json({ success: true, data });
  }),
);

router.post(
  '/auto-dispose/process',
  requirePermission('inventory.adjust'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = AutoDisposeProcessSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    const { processQuarantineAutoDispose } = await import('./quarantineAutoDisposeService.js');
    const data = await processQuarantineAutoDispose(pool, userId, {
      force: body.force ?? true,
      dryRun: body.dryRun ?? false,
    });
    res.status(body.dryRun ? 200 : 201).json({ success: true, data });
  }),
);

router.get(
  '/soft-quarantine/candidates',
  requirePermission('inventory.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const { isMultistoreEnabled } = await import('../inventory/warehouse/multistoreSettings.js');
    if (await isMultistoreEnabled(pool)) {
      return res.json({ success: true, data: { candidates: [], totalQuantity: 0 } });
    }
    const { findSoftExpiryCandidates } = await import('./softQuarantineService.js');
    const candidates = await UnitOfWork.run(pool, (client) => findSoftExpiryCandidates(client));
    const totalQuantity = candidates.reduce((s, c) => s + c.quantity, 0);
    res.json({ success: true, data: { candidates, totalQuantity } });
  }),
);

router.post(
  '/soft-quarantine',
  requirePermission('inventory.adjust'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = SoftQuarantineSchema.parse(req.body);
    const userId = req.user!.id;
    const { applySoftQuarantine } = await import('./softQuarantineService.js');
    const data = await applySoftQuarantine(pool, { ...body, userId });
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/from-expiring-report',
  requirePermission('inventory.adjust'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = FromExpiringReportSchema.parse(req.body);
    const userId = req.user!.id;
    const { quarantineFromExpiringReport } = await import('./softQuarantineService.js');
    const data = await quarantineFromExpiringReport(pool, { ...body, userId });
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/from-expiring-report/bulk',
  requirePermission('inventory.adjust'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = FromExpiringReportBulkSchema.parse(req.body);
    const userId = req.user!.id;
    const { quarantineFromExpiringReport } = await import('./softQuarantineService.js');
    const results: Array<{
      inventoryBatchId: string;
      ok: boolean;
      error?: string;
      data?: unknown;
    }> = [];
    for (const inventoryBatchId of body.inventoryBatchIds) {
      try {
        const data = await quarantineFromExpiringReport(pool, {
          inventoryBatchId,
          userId,
          memo: body.memo,
        });
        results.push({ inventoryBatchId, ok: true, data });
      } catch (err) {
        results.push({
          inventoryBatchId,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    const okCount = results.filter((r) => r.ok).length;
    res.status(207).json({
      success: true,
      data: {
        okCount,
        failCount: results.length - okCount,
        results,
      },
    });
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
