/**
 * Enhanced Period Control Routes
 * 
 * SAP-style special periods (13-16) and per-account-type controls.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import * as periodControlService from './periodControlService.js';

const router = Router();

// GET /api/period-control/special/:year — List special periods for year
router.get('/special/:year', authenticate, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  const periods = await periodControlService.getSpecialPeriods(year, req.tenantPool);
  res.json({ success: true, data: periods });
}));

// POST /api/period-control/special — Create special period
router.post('/special', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const { periodYear, periodMonth, specialPurpose } = req.body;
  const userId = req.user!.id;
  const period = await periodControlService.createSpecialPeriod(
    { periodYear, periodMonth, specialPurpose, userId },
    req.tenantPool
  );
  res.status(201).json({ success: true, data: period });
}));

// GET /api/period-control/:year — List all periods (standard + special) for year
router.get('/:year', authenticate, asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (isNaN(year)) {
    throw new (await import('../../middleware/errorHandler.js')).ValidationError('Invalid year');
  }
  const dbPool = req.tenantPool!;
  const result = await dbPool.query(
    `SELECT id, period_year, period_month, period_name, period_type, start_date, end_date,
            "Status" as status, is_closed, is_special, special_purpose,
            "LockedAt", "LockedBy", closed_at, closed_by
     FROM financial_periods
     WHERE period_year = $1
     ORDER BY period_month`,
    [year]
  );
  const periods = result.rows.map((row: Record<string, unknown>) => ({
    id: row.id,
    periodYear: row.period_year,
    periodMonth: row.period_month,
    periodName: row.period_name,
    periodType: row.period_type,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status || 'OPEN',
    isClosed: row.is_closed,
    isSpecial: row.is_special || false,
    specialPurpose: row.special_purpose || null,
  }));
  res.json({ success: true, data: periods });
}));

// POST /api/period-control/:periodId/open — Open (reopen) a period
router.post('/:periodId/open', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const dbPool = req.tenantPool!;
  const result = await dbPool.query(
    `UPDATE financial_periods SET "Status" = 'OPEN', is_closed = false, closed_at = NULL, closed_by = NULL
     WHERE id = $1 AND "Status" != 'LOCKED'
     RETURNING id, period_year, period_month, "Status" as status`,
    [req.params.periodId]
  );
  if (result.rows.length === 0) {
    throw new (await import('../../middleware/errorHandler.js')).NotFoundError('Period not found or is locked');
  }
  res.json({ success: true, data: result.rows[0] });
}));

// POST /api/period-control/:periodId/close — Close a period
router.post('/:periodId/close', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const dbPool = req.tenantPool!;
  const userId = req.user!.id;
  const result = await dbPool.query(
    `UPDATE financial_periods SET "Status" = 'CLOSED', is_closed = true, closed_at = NOW(), closed_by = $2
     WHERE id = $1 AND "Status" = 'OPEN'
     RETURNING id, period_year, period_month, "Status" as status`,
    [req.params.periodId, userId]
  );
  if (result.rows.length === 0) {
    throw new (await import('../../middleware/errorHandler.js')).NotFoundError('Period not found or not in OPEN status');
  }
  res.json({ success: true, data: result.rows[0] });
}));

// GET /api/period-control/:periodId/account-types — Get controls for period
router.get('/:periodId/account-types', authenticate, asyncHandler(async (req, res) => {
  const controls = await periodControlService.getAccountTypeControls(req.params.periodId, req.tenantPool);
  res.json({ success: true, data: controls });
}));

// PUT /api/period-control/:periodId/account-types/:type — Set control
router.put('/:periodId/account-types/:type', authenticate, requirePermission('accounting.manage'), asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const control = await periodControlService.setAccountTypeControl(
    req.params.periodId,
    req.params.type.toUpperCase(),
    req.body.isOpen,
    userId,
    req.tenantPool
  );
  res.json({ success: true, data: control });
}));

export const periodControlRoutes = router;
