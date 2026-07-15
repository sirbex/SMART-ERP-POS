/**
 * Bad Debt / AR Write-off routes — /api/bad-debt (ADR-006 Phase 4B/4C)
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';
import {
  createAndPostWriteoff,
  getWriteoffDocument,
  getWriteoffWorkqueue,
  listRecentWriteoffs,
  reverseWriteoff,
} from './badDebtService.js';
import { isBadDebtWriteoffEnabled } from './badDebtSettings.js';
import { BAD_DEBT_REASON_CODES } from '@shared/bad-debt/index.js';

const router = Router();

router.use(authenticate);

const RemitSchema = z.object({
  customerId: z.string().uuid(),
  writeoffDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  reasonCode: z.enum(BAD_DEBT_REASON_CODES as unknown as [string, ...string[]]),
  expenseAccountCode: z.string().min(1).max(20).optional(),
  memo: z.string().max(2000).optional(),
  postImmediately: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        invoiceId: z.string().uuid(),
        writeoffAmount: z.number().positive(),
        memo: z.string().max(500).optional(),
      }),
    )
    .min(1),
});

const ReverseSchema = z.object({
  reason: z.string().max(2000).optional(),
});

const WorkqueueQuerySchema = z.object({
  minAgeDays: z.coerce.number().int().min(0).max(3650).optional(),
  customerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

router.get(
  '/enabled',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const enabled = await isBadDebtWriteoffEnabled(pool);
    res.json({ success: true, data: { badDebtWriteoffEnabled: enabled, enabled } });
  }),
);

router.get(
  '/workqueue',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const q = WorkqueueQuerySchema.parse(req.query);
    const data = await getWriteoffWorkqueue(pool, q);
    res.json({ success: true, data });
  }),
);

router.get(
  '/documents',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const includeReversed = String(req.query.includeReversed || '') === 'true';
    const data = await listRecentWriteoffs(pool, { limit, includeReversed });
    res.json({ success: true, data });
  }),
);

router.get(
  '/:id',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const data = await getWriteoffDocument(pool, req.params.id);
    res.json({ success: true, data });
  }),
);

router.post(
  '/writeoff',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = RemitSchema.parse(req.body);
    const data = await createAndPostWriteoff(pool, {
      ...body,
      reasonCode: body.reasonCode as (typeof BAD_DEBT_REASON_CODES)[number],
      createdBy: req.user!.id,
    });
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/:id/reverse',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = ReverseSchema.parse(req.body ?? {});
    const data = await reverseWriteoff(pool, req.params.id, req.user!.id, body.reason);
    res.json({ success: true, data });
  }),
);

export const badDebtRoutes = router;
