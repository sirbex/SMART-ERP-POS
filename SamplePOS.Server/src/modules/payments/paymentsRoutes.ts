/**
 * Payments Routes - API endpoints for split payment system
 */

import express from 'express';
import { paymentsController } from './paymentsController.js';
import { authenticate } from '../../middleware/auth.js';

export function createPaymentsRoutes() {
  const router = express.Router();

  // All routes require authentication
  router.use(authenticate);

  router.get('/methods', paymentsController.getPaymentMethods);
  router.post('/process-split', paymentsController.processSplitPayment);
  router.get('/sale/:saleId', paymentsController.getSalePayments);
  router.get('/customer/:customerId/balance', paymentsController.getCustomerBalance);
  router.get('/customer/:customerId/history', paymentsController.getCustomerCreditHistory);
  router.post('/customer/:customerId/payment', paymentsController.recordCustomerPayment);

  return router;
}
