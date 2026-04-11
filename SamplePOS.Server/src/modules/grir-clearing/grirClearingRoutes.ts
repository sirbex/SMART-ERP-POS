/**
 * GR/IR Clearing Routes
 * 
 * API for goods receipt / invoice receipt clearing account management.
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { asyncHandler } from '../../middleware/errorHandler.js';
import * as grirService from './grirClearingService.js';

const router = Router();

// GET /api/grir-clearing/open — Open clearing items
router.get('/open', authenticate, asyncHandler(async (req, res) => {
  const supplierId = req.query.supplierId as string | undefined;
  const items = await grirService.getOpenClearingItems(supplierId, req.tenantPool);
  res.json({ success: true, data: items });
}));

// GET /api/grir-clearing/balance — Clearing account balance
router.get('/balance', authenticate, asyncHandler(async (req, res) => {
  const balance = await grirService.getClearingBalance(req.tenantPool);
  res.json({ success: true, data: balance });
}));

// GET /api/grir-clearing/:poId — Status for specific PO
router.get('/:poId', authenticate, asyncHandler(async (req, res) => {
  const record = await grirService.getGrirStatus(req.params.poId, req.tenantPool);
  res.json({ success: true, data: record });
}));

export const grirClearingRoutes = router;
