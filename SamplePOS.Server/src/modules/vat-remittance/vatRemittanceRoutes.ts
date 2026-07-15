/**
 * VAT Remittance routes — ADR-005 Phase 3C
 */

import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import { pool as globalPool } from '../../db/pool.js';
import {
  createAndPostVatRemittance,
  getVatRemittanceWorksheet,
  reverseVatRemittance,
} from './vatRemittanceService.js';
import { isVatRemittanceDocumentEnabled } from './vatRemittanceSettings.js';
import { isTreasuryDocumentEnabled } from '../treasury/treasurySettings.js';

const router = Router();

router.use(authenticate);

const WorksheetQuerySchema = z.object({
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const RemitSchema = z.object({
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paymentAccountCode: z.string().min(1).max(20),
  authorityReference: z.string().min(1).max(120),
  memo: z.string().max(2000).optional(),
  postImmediately: z.boolean().optional(),
});

const ReverseSchema = z.object({
  reason: z.string().max(2000).optional(),
});

router.get(
  '/enabled',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const [vatOn, treasuryOn] = await Promise.all([
      isVatRemittanceDocumentEnabled(pool),
      isTreasuryDocumentEnabled(pool),
    ]);
    res.json({
      success: true,
      data: {
        vatRemittanceDocumentEnabled: vatOn,
        treasuryDocumentEnabled: treasuryOn,
        enabled: vatOn && treasuryOn,
      },
    });
  }),
);

router.get(
  '/worksheet',
  requirePermission('accounting.read'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const q = WorksheetQuerySchema.parse(req.query);
    const data = await getVatRemittanceWorksheet(pool, q.periodFrom, q.periodTo);
    res.json({ success: true, data });
  }),
);

router.post(
  '/remit',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = RemitSchema.parse(req.body);
    const userId = req.user!.id;
    const data = await createAndPostVatRemittance(pool, { ...body, createdBy: userId });
    res.status(201).json({ success: true, data });
  }),
);

router.post(
  '/:id/reverse',
  requirePermission('accounting.manage'),
  asyncHandler(async (req, res) => {
    const pool = req.tenantPool || globalPool;
    const body = ReverseSchema.parse(req.body ?? {});
    const data = await reverseVatRemittance(
      pool,
      req.params.id,
      req.user!.id,
      body.reason,
    );
    res.json({ success: true, data });
  }),
);

export const vatRemittanceRoutes = router;
