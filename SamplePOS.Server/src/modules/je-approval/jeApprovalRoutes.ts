/**
 * Journal Entry Approval Workflow Routes
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as jeApprovalService from './jeApprovalService.js';

const router = Router();

// =========================================
// APPROVAL RULES
// =========================================

router.get('/rules', authenticate, asyncHandler(async (req, res) => {
  const rules = await jeApprovalService.getApprovalRules(req.tenantPool);
  res.json({ success: true, data: rules });
}));

router.post('/rules', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const rule = await jeApprovalService.createApprovalRule(req.body, req.tenantPool);
  res.status(201).json({ success: true, data: rule });
}));

router.put('/rules/:id', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const rule = await jeApprovalService.updateApprovalRule(req.params.id, req.body, req.tenantPool);
  res.json({ success: true, data: rule });
}));

// =========================================
// APPROVAL WORKFLOW
// =========================================

// GET /api/je-approvals/pending — Pending approvals for reviewers
router.get('/pending', authenticate, asyncHandler(async (req, res) => {
  const pending = await jeApprovalService.getPendingApprovals(req.tenantPool);
  res.json({ success: true, data: pending });
}));

// POST /api/je-approvals/submit — Submit JE for approval
router.post('/submit', authenticate, asyncHandler(async (req, res) => {
  const { transactionId, totalAmount } = req.body;
  if (!transactionId) throw new ValidationError('transactionId required');
  const userId = req.user!.id;
  const result = await jeApprovalService.submitForApproval(transactionId, totalAmount, userId, req.tenantPool);
  res.json({ success: true, data: result });
}));

// POST /api/je-approvals/:id/review — Approve or reject
router.post('/:id/review', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { action, notes } = req.body;
  if (!action || !['APPROVE', 'REJECT'].includes(action)) {
    throw new ValidationError('action must be APPROVE or REJECT');
  }
  const userId = req.user!.id;
  const result = await jeApprovalService.reviewApproval(
    req.params.id, { action, notes }, userId, req.tenantPool
  );
  res.json({ success: true, data: result });
}));

// POST /api/je-approvals/:id/approve — Shortcut to approve
router.post('/:id/approve', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const result = await jeApprovalService.reviewApproval(
    req.params.id, { action: 'APPROVE', notes: req.body.notes || '' }, userId, req.tenantPool
  );
  res.json({ success: true, data: result });
}));

// POST /api/je-approvals/:id/reject — Shortcut to reject
router.post('/:id/reject', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const result = await jeApprovalService.reviewApproval(
    req.params.id, { action: 'REJECT', notes: req.body.reason || req.body.notes || '' }, userId, req.tenantPool
  );
  res.json({ success: true, data: result });
}));

// GET /api/je-approvals/history/:transactionId — History for a JE
router.get('/history/:transactionId', authenticate, asyncHandler(async (req, res) => {
  const history = await jeApprovalService.getApprovalHistory(req.params.transactionId, req.tenantPool);
  res.json({ success: true, data: history });
}));

export const jeApprovalRoutes = router;
