/**
 * Dunning / Collections Routes
 * 
 * SAP-style dunning management for overdue receivables.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as dunningService from './dunningService.js';

const router = Router();

// =========================================
// DUNNING LEVELS CONFIGURATION
// =========================================

// GET /api/dunning/levels — List levels
router.get('/levels', authenticate, asyncHandler(async (req, res) => {
  const levels = await dunningService.getDunningLevels(req.tenantPool);
  res.json({ success: true, data: levels });
}));

// POST /api/dunning/levels — Create level
router.post('/levels', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const level = await dunningService.createDunningLevel(req.body, req.tenantPool);
  res.status(201).json({ success: true, data: level });
}));

// PUT /api/dunning/levels/:id — Update level
router.put('/levels/:id', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const level = await dunningService.updateDunningLevel(req.params.id, req.body, req.tenantPool);
  res.json({ success: true, data: level });
}));

// =========================================
// DUNNING RUN
// =========================================

// POST /api/dunning/analyze — Analyze (preview) dunning run
router.post('/analyze', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { asOfDate } = req.body;
  if (!asOfDate) throw new ValidationError('asOfDate is required (YYYY-MM-DD)');
  const result = await dunningService.analyzeDunningRun(asOfDate, req.tenantPool);
  res.json({ success: true, data: result });
}));

// POST /api/dunning/execute — Execute dunning run (post fees, block credit)
router.post('/execute', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { proposals, date } = req.body;
  if (!proposals || !Array.isArray(proposals)) throw new ValidationError('proposals array required');
  if (!date) throw new ValidationError('date is required (YYYY-MM-DD)');

  const userId = req.user!.id;
  const result = await dunningService.executeDunningRun(proposals, date, userId, req.tenantPool);
  res.json({ success: true, data: result });
}));

// =========================================
// DUNNING HISTORY
// =========================================

// GET /api/dunning/history/:customerId — Customer dunning history
router.get('/history/:customerId', authenticate, asyncHandler(async (req, res) => {
  const history = await dunningService.getCustomerDunningHistory(req.params.customerId, req.tenantPool);
  res.json({ success: true, data: history });
}));

export const dunningRoutes = router;
