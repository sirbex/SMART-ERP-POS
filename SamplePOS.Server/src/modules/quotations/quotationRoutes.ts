/**
 * Quotation Routes
 * API endpoints for quotations system
 */

import { Router } from 'express';
import { quotationController } from './quotationController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { pool as globalPool } from '../../db/pool.js';

const router = Router();

// Middleware to attach pool to request
router.use((req, res, next) => {
  req.pool = req.tenantPool || globalPool;
  next();
});

// Standard quotation management (all routes require authentication)
router.post('/quotations', authenticate, requirePermission('quotations.create'), quotationController.createQuotation);
router.get('/quotations', authenticate, requirePermission('quotations.read'), quotationController.listQuotations);
router.get('/quotations/:id', authenticate, requirePermission('quotations.read'), quotationController.getQuotation);
router.get('/quotations/number/:quoteNumber', authenticate, requirePermission('quotations.read'), quotationController.getQuotationByNumber);
router.put('/quotations/:id', authenticate, requirePermission('quotations.update'), quotationController.updateQuotation);
router.put('/quotations/:id/status', authenticate, requirePermission('quotations.update'), quotationController.updateQuotationStatus);
router.put('/quotations/:id/items/decisions', authenticate, requirePermission('quotations.update'), quotationController.updateItemDecisions);
router.post('/quotations/:id/convert', authenticate, requirePermission('sales.create'), quotationController.convertQuotation);
router.post('/quotations/expire', authenticate, requirePermission('quotations.update'), quotationController.expireOverdue);
router.delete('/quotations/:id', authenticate, requirePermission('quotations.delete'), quotationController.deleteQuotation);

// POS quick quote endpoints
router.post('/pos/quote', authenticate, requirePermission('quotations.create'), quotationController.createQuickQuote);

export default router;
