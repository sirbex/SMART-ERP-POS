/**
 * Payments Routes - API endpoints for split payment system
 */

import express from 'express';
import { paymentsController } from './paymentsController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

export function createPaymentsRoutes() {
  const router = express.Router();

  // All routes require authentication
  router.use(authenticate);

  router.get('/methods', requirePermission('pos.read'), paymentsController.getPaymentMethods);
  router.post(
    '/process-split',
    requirePermission('pos.create'),
    paymentsController.processSplitPayment
  );
  router.get('/sale/:saleId', requirePermission('sales.read'), paymentsController.getSalePayments);
  router.get(
    '/customer/:customerId/balance',
    requirePermission('customers.read'),
    paymentsController.getCustomerBalance
  );
  router.get(
    '/customer/:customerId/history',
    requirePermission('customers.read'),
    paymentsController.getCustomerCreditHistory
  );
  router.post(
    '/customer/:customerId/payment',
    requirePermission('pos.create'),
    paymentsController.recordCustomerPayment
  );

  return router;
}
