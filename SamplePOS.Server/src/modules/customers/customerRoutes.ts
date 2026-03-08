// Customers Routes

import { Router } from 'express';
import * as customerController from './customerController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = Router();

// All customer routes require authentication
router.use(authenticate);

router.get('/', customerController.getCustomers);
router.get('/search', customerController.searchCustomers);
router.get('/by-number/:customerNumber', customerController.getCustomerByNumber);
router.get('/:id', customerController.getCustomer);

// Customer transaction endpoints
router.get('/:id/sales', customerController.getCustomerSales);
router.get('/:id/transactions', customerController.getCustomerTransactions);
router.get('/:id/summary', customerController.getCustomerSummary);
router.get('/:id/statement', customerController.getCustomerStatement);
router.get('/:id/statement/export.csv', customerController.exportCustomerStatementCsv);
router.get('/:id/statement/export.pdf', customerController.exportCustomerStatementPdf);

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
