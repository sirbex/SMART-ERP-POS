/**
 * Payments Routes - API endpoints for split payment system
 */

import express from 'express';
import { Pool } from 'pg';
import { paymentsController } from './paymentsController.js';
import { authenticate } from '../../middleware/auth.js';

export function createPaymentsRoutes(pool: Pool) {
  const router = express.Router();

  // All routes require authentication
  router.use(authenticate);

  /**
   * GET /api/payments/methods
   * Get all available payment methods
   */
  router.get('/methods', (req, res) => {
    paymentsController.getPaymentMethods(req, res, pool);
  });

  /**
   * POST /api/payments/process-split
   * Process a split payment for a sale
   * Body: { saleId, totalAmount, payments: [{method, amount, reference?, notes?}], customerId? }
   */
  router.post('/process-split', (req, res) => {
    paymentsController.processSplitPayment(req, res, pool);
  });

  /**
   * GET /api/payments/sale/:saleId
   * Get payment breakdown for a sale
   */
  router.get('/sale/:saleId', (req, res) => {
    paymentsController.getSalePayments(req, res, pool);
  });

  /**
   * GET /api/payments/customer/:customerId/balance
   * Get customer current credit balance
   */
  router.get('/customer/:customerId/balance', (req, res) => {
    paymentsController.getCustomerBalance(req, res, pool);
  });

  /**
   * GET /api/payments/customer/:customerId/history
   * Get customer credit transaction history
   * Query params: limit (default: 50)
   */
  router.get('/customer/:customerId/history', (req, res) => {
    paymentsController.getCustomerCreditHistory(req, res, pool);
  });

  /**
   * POST /api/payments/customer/:customerId/payment
   * Record a customer credit payment
   * Body: { amount, paymentMethod, reference?, notes? }
   */
  router.post('/customer/:customerId/payment', (req, res) => {
    paymentsController.recordCustomerPayment(req, res, pool);
  });

  return router;
}
