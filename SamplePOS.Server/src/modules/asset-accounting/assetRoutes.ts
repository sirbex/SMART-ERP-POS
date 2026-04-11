/**
 * Asset Accounting Routes
 * 
 * Fixed asset management, depreciation, and disposal.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler, ValidationError } from '../../middleware/errorHandler.js';
import * as assetService from './assetService.js';

const router = Router();

// =========================================
// ASSET CATEGORIES
// =========================================

router.get('/categories', authenticate, asyncHandler(async (req, res) => {
  const categories = await assetService.getAssetCategories(req.tenantPool);
  res.json({ success: true, data: categories });
}));

router.post('/categories', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { code, name, usefulLifeMonths, depreciationMethod, depreciationRate,
    assetAccountCode, depreciationAccountCode, accumDepreciationAccountCode } = req.body;
  if (!code || !name || !usefulLifeMonths) {
    throw new ValidationError('code, name, and usefulLifeMonths are required');
  }
  const category = await assetService.createAssetCategory({
    code,
    name,
    usefulLifeMonths,
    depreciationMethod: depreciationMethod || 'STRAIGHT_LINE',
    depreciationRate: depreciationRate || null,
    assetAccountCode: assetAccountCode || '1500',
    depreciationAccountCode: depreciationAccountCode || '6500',
    accumDepreciationAccountCode: accumDepreciationAccountCode || '1550',
  }, req.tenantPool);
  res.status(201).json({ success: true, data: category });
}));

// =========================================
// FIXED ASSETS
// =========================================

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const status = req.query.status as string | undefined;
  const categoryId = req.query.categoryId as string | undefined;

  const result = await assetService.getFixedAssets({ page, limit, status, categoryId }, req.tenantPool);
  res.json({
    success: true,
    data: result.data,
    pagination: { page, limit, total: result.total, totalPages: Math.ceil(result.total / limit) },
  });
}));

router.get('/summary', authenticate, asyncHandler(async (req, res) => {
  const summary = await assetService.getAssetRegisterSummary(req.tenantPool);
  res.json({ success: true, data: summary });
}));

router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const asset = await assetService.getFixedAssetById(req.params.id, req.tenantPool);
  res.json({ success: true, data: asset });
}));

router.post('/', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { name, categoryId, acquisitionDate, acquisitionCost } = req.body;
  if (!name || !categoryId || !acquisitionDate || !acquisitionCost) {
    throw new ValidationError('name, categoryId, acquisitionDate, and acquisitionCost are required');
  }
  const asset = await assetService.acquireAsset({
    ...req.body,
    paymentMethod: req.body.paymentMethod || 'CASH',
    userId,
  }, req.tenantPool);
  res.status(201).json({ success: true, data: asset });
}));

// =========================================
// DEPRECIATION
// =========================================

router.get('/:id/depreciation', authenticate, asyncHandler(async (req, res) => {
  const schedule = await assetService.getDepreciationSchedule(req.params.id, req.tenantPool);
  res.json({ success: true, data: schedule });
}));

router.post('/depreciation/run', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { year, month } = req.body;
  if (!year || !month) throw new ValidationError('year and month required');
  const userId = req.user!.id;
  const result = await assetService.runMonthlyDepreciation(year, month, userId, req.tenantPool);
  res.json({ success: true, data: result });
}));

// =========================================
// DISPOSAL
// =========================================

router.post('/:id/dispose', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { disposalDate, disposalAmount } = req.body;
  if (!disposalDate) throw new ValidationError('disposalDate required');
  const asset = await assetService.disposeAsset(
    { assetId: req.params.id, disposalDate, disposalAmount: disposalAmount || 0, userId },
    req.tenantPool
  );
  res.json({ success: true, data: asset });
}));

export const assetRoutes = router;
