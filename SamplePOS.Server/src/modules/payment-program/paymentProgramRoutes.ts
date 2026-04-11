/**
 * Payment Program (Batch AP) Routes
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import * as paymentProgramService from './paymentProgramService.js';

const router = Router();

// =========================================
// PAYMENT RUNS
// =========================================

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
  const status = req.query.status as string | undefined;
  const result = await paymentProgramService.getPaymentRuns({ page, limit, status }, req.tenantPool);
  res.json({
    success: true,
    data: result.data,
    pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
  });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const run = await paymentProgramService.getPaymentRunById(req.params.id, req.tenantPool);
  res.json({ success: true, data: run });
}));

router.get('/:id/items', authenticate, asyncHandler(async (req, res) => {
  const items = await paymentProgramService.getPaymentRunItems(req.params.id, req.tenantPool);
  res.json({ success: true, data: items });
}));

// POST /api/payment-program — Create run
router.post('/', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const run = await paymentProgramService.createPaymentRun({ ...req.body, userId }, req.tenantPool);
  res.status(201).json({ success: true, data: run });
}));

// POST /api/payment-program/:id/propose — Propose payments
router.post('/:id/propose', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const run = await paymentProgramService.proposePayments(req.params.id, userId, req.tenantPool);
  res.json({ success: true, data: run });
}));

// POST /api/payment-program/:id/approve — Approve run
router.post('/:id/approve', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const run = await paymentProgramService.approvePaymentRun(req.params.id, userId, req.tenantPool);
  res.json({ success: true, data: run });
}));

// POST /api/payment-program/:id/execute — Execute run
router.post('/:id/execute', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const result = await paymentProgramService.executePaymentRun(req.params.id, userId, req.tenantPool);
  res.json({ success: true, data: result });
}));

// POST /api/payment-program/:id/cancel — Cancel run
router.post('/:id/cancel', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const run = await paymentProgramService.cancelPaymentRun(req.params.id, userId, req.tenantPool);
  res.json({ success: true, data: run });
}));

export const paymentProgramRoutes = router;
