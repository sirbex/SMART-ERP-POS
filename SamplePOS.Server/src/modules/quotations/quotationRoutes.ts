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
router.post('/quotations', authenticate, quotationController.createQuotation);
router.get('/quotations', authenticate, quotationController.listQuotations);
router.get('/quotations/:id', authenticate, quotationController.getQuotation);
router.get('/quotations/number/:quoteNumber', authenticate, quotationController.getQuotationByNumber);
router.put('/quotations/:id', authenticate, quotationController.updateQuotation);
router.put('/quotations/:id/status', authenticate, requirePermission('sales.update'), quotationController.updateQuotationStatus);
router.post('/quotations/:id/convert', authenticate, requirePermission('sales.create'), quotationController.convertQuotation);
router.delete('/quotations/:id', authenticate, requirePermission('sales.delete'), quotationController.deleteQuotation);

// POS quick quote endpoints
router.post('/pos/quote', authenticate, quotationController.createQuickQuote);

export default router;
