import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';
import { invoiceController } from './invoiceController.js';

export const invoiceRoutes = Router();

// List / Get
invoiceRoutes.get('/', authenticate, invoiceController.listInvoices);
invoiceRoutes.get('/:id', authenticate, invoiceController.getInvoice);
invoiceRoutes.get('/:id/export.pdf', authenticate, invoiceController.exportInvoicePdf);

// Create invoice - requires accounting.create permission
invoiceRoutes.post('/', authenticate, requirePermission('accounting.create'), invoiceController.createInvoice);

// Payments - record & list - requires sales.create permission
invoiceRoutes.post(
  '/:id/payments',
  authenticate,
  requirePermission('sales.create'),
  invoiceController.addPayment
);
invoiceRoutes.get('/:id/payments', authenticate, invoiceController.listPayments);
