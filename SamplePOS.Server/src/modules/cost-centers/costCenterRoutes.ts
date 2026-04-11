/**
 * Cost Center Routes
 * 
 * RESTful API for cost center management (SAP CO-Lite).
 * Supports hierarchy, budgets, and expense allocation reporting.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import * as costCenterService from './costCenterService.js';

const router = Router();

// GET /api/cost-centers — List cost centers
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const isActive = req.query.isActive !== undefined ? req.query.isActive === 'true' : undefined;
  const parentId = req.query.parentId as string | undefined;

  const result = await costCenterService.getCostCenters(
    { page, limit, isActive, parentId: parentId === 'null' ? null : parentId },
    req.tenantPool
  );
  res.json({ success: true, ...result });
}));

// GET /api/cost-centers/hierarchy — Tree view
router.get('/hierarchy', authenticate, asyncHandler(async (req, res) => {
  const tree = await costCenterService.getCostCenterHierarchy(req.tenantPool);
  res.json({ success: true, data: tree });
}));

// GET /api/cost-centers/:id — Single cost center
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const cc = await costCenterService.getCostCenterById(req.params.id, req.tenantPool);
  res.json({ success: true, data: cc });
}));

// POST /api/cost-centers — Create
router.post('/', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { code, name, description, parentId, managerId } = req.body;
  const cc = await costCenterService.createCostCenter(
    { code, name, description, parentId, managerId },
    req.tenantPool
  );
  res.status(201).json({ success: true, data: cc });
}));

// PUT /api/cost-centers/:id — Update
router.put('/:id', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { name, description, parentId, managerId, isActive } = req.body;
  const cc = await costCenterService.updateCostCenter(
    req.params.id,
    { name, description, parentId, managerId, isActive },
    req.tenantPool
  );
  res.json({ success: true, data: cc });
}));

// GET /api/cost-centers/:id/report — Cost center P&L report
router.get('/:id/report', authenticate, asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return res.status(400).json({ success: false, error: 'startDate and endDate are required' });
  }
  const report = await costCenterService.getCostCenterReport(
    req.params.id,
    startDate as string,
    endDate as string,
    req.tenantPool
  );
  res.json({ success: true, data: report });
}));

// GET /api/cost-centers/:id/budget — Get budget
router.get('/:id/budget', authenticate, asyncHandler(async (req, res) => {
  const year = parseInt(req.query.year as string) || new Date().getFullYear();
  const month = req.query.month ? parseInt(req.query.month as string) : undefined;
  const budget = await costCenterService.getBudget(req.params.id, year, month, req.tenantPool);
  res.json({ success: true, data: budget });
}));

// POST /api/cost-centers/:id/budget — Set budget
router.post('/:id/budget', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { year, month, budgetAmount } = req.body;
  const budget = await costCenterService.setBudget(
    req.params.id, year, month, budgetAmount, req.tenantPool
  );
  res.json({ success: true, data: budget });
}));

export const costCenterRoutes = router;
