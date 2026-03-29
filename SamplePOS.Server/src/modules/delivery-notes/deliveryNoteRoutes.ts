// Delivery Note Routes
// API endpoints for wholesale delivery notes

import { Router } from 'express';
import { deliveryNoteController } from './deliveryNoteController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { pool as globalPool } from '../../db/pool.js';

const router = Router();

// Attach pool
router.use((req, _res, next) => {
  req.pool = req.tenantPool || globalPool;
  next();
});

// All routes require authentication
router.use(authenticate);

// Fulfillment status (specific path — must come before /:id)
router.get('/quotation/:id/fulfillment', deliveryNoteController.fulfillment);

// DN by number (specific path — must come before /:id)
router.get('/number/:dnNumber', deliveryNoteController.getByNumber);

// CRUD
router.post('/', requirePermission('sales.create'), deliveryNoteController.create);
router.get('/', deliveryNoteController.list);
router.get('/:id', deliveryNoteController.getById);
router.delete('/:id', requirePermission('sales.delete'), deliveryNoteController.remove);

// Posting (stock movement)
router.post('/:id/post', requirePermission('sales.create'), deliveryNoteController.post);

// Invoice from DN (wholesale invoicing)
router.post('/:id/invoice', requirePermission('sales.create'), deliveryNoteController.createInvoice);

// PDF export
router.get('/:id/pdf', deliveryNoteController.exportPdf);

export default router;
