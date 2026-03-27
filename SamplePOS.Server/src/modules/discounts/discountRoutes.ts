// Discount Routes - API endpoints for discount system

import { Router } from 'express';
import * as discountController from './discountController.js';
import { requirePermission, requireAnyPermission } from '../../rbac/middleware.js';

const router = Router();

// Read routes - any authenticated user (authenticate applied at mount in server.ts)
router.get('/', discountController.listDiscounts);
router.get('/pending', discountController.getPendingAuthorizations);
router.get('/:id', discountController.getDiscount);

// Apply discount to sale - cashier can apply
router.post('/apply', requireAnyPermission(['pos.create', 'sales.create']), discountController.applyDiscount);

// Approve discount (MANAGER/ADMIN)
router.post('/approve', requirePermission('sales.approve'), discountController.approveDiscount);

// ADMIN only routes
router.post('/', requirePermission('admin.create'), discountController.createDiscount);
router.put('/:id', requirePermission('admin.update'), discountController.updateDiscount);
router.delete('/:id', requirePermission('admin.delete'), discountController.deleteDiscount);

export const discountRoutes = router;
