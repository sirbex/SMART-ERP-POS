/**
 * Payments Routes - API endpoints for split payment system
 *
 * SSOT note (ERP stabilization):
 * - POST /customer/:customerId/payment → legacy entry; delegates to arPaymentService (Wave 1).
 * - Canonical customer receipt path: POST /api/ar-payments (arPaymentRoutes).
 * - Invoice-level receipts: POST /api/invoices/:id/payments → AR SSOT for CASH/CARD/MOBILE/BANK (Wave 2).
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
    /** @deprecated Prefer POST /api/ar-payments — kept for POS/legacy clients; SSOT redirect active. */
    paymentsController.recordCustomerPayment
  );

  return router;
}
