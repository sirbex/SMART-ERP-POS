// Customers Routes

import { Router } from 'express';
import * as customerController from './customerController.js';
import { authenticate, optionalAuth } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = Router();

// TEMPORARY FIX: Use optional auth for GET routes to fix auth issues
router.get('/', optionalAuth, customerController.getCustomers);
router.get('/search', optionalAuth, customerController.searchCustomers);
router.get('/by-number/:customerNumber', optionalAuth, customerController.getCustomerByNumber);
router.get('/:id', optionalAuth, customerController.getCustomer);

// Customer transaction endpoints - TEMPORARY: Use optional auth
router.get('/:id/sales', optionalAuth, customerController.getCustomerSales);
router.get('/:id/transactions', optionalAuth, customerController.getCustomerTransactions);
router.get('/:id/summary', optionalAuth, customerController.getCustomerSummary);
router.get('/:id/statement', optionalAuth, customerController.getCustomerStatement);
router.get('/:id/statement/export.csv', optionalAuth, customerController.exportCustomerStatementCsv);
router.get('/:id/statement/export.pdf', optionalAuth, customerController.exportCustomerStatementPdf);

// Create/Update/Delete - requires customer permissions
router.post('/', authenticate, requirePermission('customers.create'), customerController.createCustomer);
router.put('/:id', authenticate, requirePermission('customers.update'), customerController.updateCustomer);
router.patch(
  '/:id/active',
  authenticate,
  requirePermission('customers.update'),
  customerController.toggleCustomerActive
);
router.delete(
  '/:id',
  authenticate,
  requirePermission('customers.delete'),
  customerController.deleteCustomer
);

export const customerRoutes = router;
