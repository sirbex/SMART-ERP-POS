/**
 * Quotation Routes
 * API endpoints for quotations system
 */

import { Router } from 'express';
import { quotationController } from './quotationController';
import { authenticate } from '../../middleware/auth.js';
import { pool as globalPool } from '../../db/pool.js';

const router = Router();

// Middleware to attach pool to request
router.use((req, res, next) => {
  (req as any).pool = req.tenantPool || globalPool;
  next();
});

// All routes require authentication
router.use(authenticate);

// Standard quotation management
router.post('/quotations', quotationController.createQuotation);
router.get('/quotations', quotationController.listQuotations);
router.get('/quotations/:id', quotationController.getQuotation);
router.get('/quotations/number/:quoteNumber', quotationController.getQuotationByNumber);
router.put('/quotations/:id', quotationController.updateQuotation);
router.put('/quotations/:id/status', quotationController.updateQuotationStatus);
router.post('/quotations/:id/convert', quotationController.convertQuotation);
router.delete('/quotations/:id', quotationController.deleteQuotation);

// POS quick quote endpoints
router.post('/pos/quote', quotationController.createQuickQuote);

export default router;
