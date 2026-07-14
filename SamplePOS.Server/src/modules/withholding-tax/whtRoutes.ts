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
  const { whtTypeId, baseAmount, side } = req.body;
  if (!whtTypeId || baseAmount === undefined) throw new ValidationError('whtTypeId and baseAmount required');
  if (side != null && side !== 'SUPPLIER' && side !== 'CUSTOMER') {
    throw new ValidationError('side must be SUPPLIER or CUSTOMER');
  }
  const calc = await whtService.calculateWht(whtTypeId, baseAmount, req.tenantPool, side);
  res.json({ success: true, data: calc });
}));

// =========================================
// WHT SETTLEMENT (remit payable / recover receivable)
// =========================================

router.post('/remit', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { amount, date, reference, paymentAccountCode, payableAccountCode } = req.body;
  if (!amount || !date || !reference) throw new ValidationError('amount, date, and reference required');
  const userId = req.user!.id;
  const result = await whtService.remitWht(
    { amount, date, reference, userId, paymentAccountCode, payableAccountCode },
    req.tenantPool,
  );
  res.json({ success: true, data: result });
}));

router.post('/recover', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { amount, date, reference, paymentAccountCode, receivableAccountCode } = req.body;
  if (!amount || !date || !reference) throw new ValidationError('amount, date, and reference required');
  const userId = req.user!.id;
  const result = await whtService.recoverWhtReceivable(
    { amount, date, reference, userId, paymentAccountCode, receivableAccountCode },
    req.tenantPool,
  );
  res.json({ success: true, data: result });
}));

// =========================================
// WHT REPORTING
// =========================================

router.get('/balance', authenticate, asyncHandler(async (req, res) => {
  const balances = await whtService.getWhtBalances(req.tenantPool);
  // Keep legacy payable fields at top level for existing clients.
  res.json({
    success: true,
    data: {
      balance: balances.payable.balance,
      entries: balances.payable.entries,
      payable: balances.payable,
      receivable: balances.receivable,
    },
  });
}));

router.get('/certificates', authenticate, asyncHandler(async (req, res) => {
  const { startDate, endDate, supplierId, customerId } = req.query;
  const certificates = await whtService.listWhtCertificates(
    {
      startDate: startDate as string | undefined,
      endDate: endDate as string | undefined,
      supplierId: supplierId as string | undefined,
      customerId: customerId as string | undefined,
    },
    req.tenantPool,
  );
  res.json({ success: true, data: certificates });
}));

router.get('/entries', authenticate, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) throw new ValidationError('startDate and endDate required');
  const entries = await whtService.getWhtEntries(startDate as string, endDate as string, req.tenantPool);
  res.json({ success: true, data: entries });
}));

// Tax compliance reports live under /api/reports/tax-compliance/*
// (SSOT calculation: whtReportService). Ops (types/remit/recover/certs) stay here.

export const whtRoutes = router;
