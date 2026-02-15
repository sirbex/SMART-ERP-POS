// Discount Routes - API endpoints for discount system

import { Router } from 'express';
import * as discountController from './discountController';

const router = Router();

// Public routes (authenticated users)
router.get('/', discountController.listDiscounts);
router.get('/pending', discountController.getPendingAuthorizations);
router.get('/:id', discountController.getDiscount);

// Apply discount to sale
router.post('/apply', discountController.applyDiscount);

// Approve discount (MANAGER/ADMIN)
router.post('/approve', discountController.approveDiscount);

// ADMIN only routes
router.post('/', discountController.createDiscount);
router.put('/:id', discountController.updateDiscount);
router.delete('/:id', discountController.deleteDiscount);

export const discountRoutes = router;
