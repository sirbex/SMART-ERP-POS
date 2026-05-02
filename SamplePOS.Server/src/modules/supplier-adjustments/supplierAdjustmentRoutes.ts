/**
 * Supplier Adjustment Routes
 * Base path: /api/supplier-adjustments
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { supplierAdjustmentController } from './supplierAdjustmentController.js';

export const supplierAdjustmentRoutes = Router();

// GET /api/supplier-adjustments/invoice/:invoiceId/context
supplierAdjustmentRoutes.get(
    '/invoice/:invoiceId/context',
    authenticate,
    requirePermission('suppliers.read'),
    supplierAdjustmentController.getContext,
);

// POST /api/supplier-adjustments/adjust
supplierAdjustmentRoutes.post(
    '/adjust',
    authenticate,
    requirePermission('suppliers.create'),
    supplierAdjustmentController.adjust,
);
