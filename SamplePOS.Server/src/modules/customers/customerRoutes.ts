// Customers Routes

import { Router } from 'express';
import * as customerController from './customerController.js';
import * as groupController from './customerGroupController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = Router();

// All customer routes require authentication
router.use(authenticate);

// ── Customer Group routes (before /:id to avoid conflicts) ──
router.get('/groups', groupController.listGroups);
router.post('/groups', requirePermission('customers.create'), groupController.createGroup);
router.get('/groups/:id', groupController.getGroup);
router.put('/groups/:id', requirePermission('customers.update'), groupController.updateGroup);
router.delete('/groups/:id', requirePermission('customers.delete'), groupController.deleteGroup);
router.get('/groups/:id/customers', groupController.getGroupCustomers);
router.post('/groups/:id/assign', requirePermission('customers.update'), groupController.assignCustomer);
router.post('/groups/:id/unassign', requirePermission('customers.update'), groupController.unassignCustomer);
router.post('/groups/:id/bulk-assign', requirePermission('customers.update'), groupController.bulkAssignCustomers);

// ── Customer routes ──
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
// PDF export — redirect to centralized DocumentRenderer
router.get('/:id/statement/export.pdf', (req, res) => {
  const qs = new URLSearchParams();
  const start = (req.query.start as string | undefined) ?? (req.query.startDate as string | undefined);
  const end = (req.query.end as string | undefined) ?? (req.query.endDate as string | undefined);
  if (start) qs.set('startDate', start.slice(0, 10));
  if (end) qs.set('endDate', end.slice(0, 10));
  const query = qs.toString();
  res.redirect(307, `/api/documents/CUSTOMER_STATEMENT/${req.params.id}${query ? `?${query}` : ''}`);
});

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
