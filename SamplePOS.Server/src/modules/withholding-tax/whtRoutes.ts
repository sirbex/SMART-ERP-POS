/**
 * Withholding Tax Routes
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as whtService from './whtService.js';

const router = Router();

// =========================================
// WHT TYPE CONFIGURATION
// =========================================

router.get('/types', authenticate, asyncHandler(async (req, res) => {
  const types = await whtService.getWhtTypes(req.tenantPool);
  res.json({ success: true, data: types });
}));

router.post('/types', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const whtType = await whtService.createWhtType(req.body, req.tenantPool);
  res.status(201).json({ success: true, data: whtType });
}));

router.put('/types/:id', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const whtType = await whtService.updateWhtType(req.params.id, req.body, req.tenantPool);
  res.json({ success: true, data: whtType });
}));

// =========================================
// WHT CALCULATION & APPLICATION
// =========================================

router.post('/calculate', authenticate, asyncHandler(async (req, res) => {
  const { whtTypeId, baseAmount } = req.body;
  if (!whtTypeId || baseAmount === undefined) throw new ValidationError('whtTypeId and baseAmount required');
  const calc = await whtService.calculateWht(whtTypeId, baseAmount, req.tenantPool);
  res.json({ success: true, data: calc });
}));

// =========================================
// WHT REMITTANCE
// =========================================

router.post('/remit', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { amount, date, reference } = req.body;
  if (!amount || !date || !reference) throw new ValidationError('amount, date, and reference required');
  const userId = req.user!.id;
  const result = await whtService.remitWht({ amount, date, reference, userId }, req.tenantPool);
  res.json({ success: true, data: result });
}));

// =========================================
// WHT REPORTING
// =========================================

router.get('/balance', authenticate, asyncHandler(async (req, res) => {
  const balance = await whtService.getWhtPayableBalance(req.tenantPool);
  res.json({ success: true, data: balance });
}));

router.get('/entries', authenticate, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) throw new ValidationError('startDate and endDate required');
  const entries = await whtService.getWhtEntries(startDate as string, endDate as string, req.tenantPool);
  res.json({ success: true, data: entries });
}));

export const whtRoutes = router;
