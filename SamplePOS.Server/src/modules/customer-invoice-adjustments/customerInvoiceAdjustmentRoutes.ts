/**
 * Customer Invoice Adjustment Routes
 * Base path: /api/customer-invoice-adjustments
 */

import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { customerInvoiceAdjustmentController } from './customerInvoiceAdjustmentController.js';

export const customerInvoiceAdjustmentRoutes = Router();

customerInvoiceAdjustmentRoutes.get(
    '/invoice/:invoiceId/context',
    authenticate,
    requirePermission('customers.read'),
    customerInvoiceAdjustmentController.getContext,
);

customerInvoiceAdjustmentRoutes.post(
    '/adjust',
    authenticate,
    requirePermission('customers.adjust'),
    customerInvoiceAdjustmentController.adjust,
);
