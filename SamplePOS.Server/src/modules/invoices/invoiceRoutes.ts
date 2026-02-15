import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
import { invoiceController } from './invoiceController.js';

export const invoiceRoutes = Router();

// List / Get
invoiceRoutes.get('/', authenticate, invoiceController.listInvoices);
invoiceRoutes.get('/:id', authenticate, invoiceController.getInvoice);
invoiceRoutes.get('/:id/export.pdf', authenticate, invoiceController.exportInvoicePdf);

// Create invoice - MANAGER/ADMIN
invoiceRoutes.post('/', authenticate, authorize('ADMIN', 'MANAGER'), invoiceController.createInvoice);

// Payments - record & list - CASHIER/MANAGER/ADMIN
invoiceRoutes.post(
  '/:id/payments',
  authenticate,
  authorize('ADMIN', 'MANAGER', 'CASHIER'),
  invoiceController.addPayment
);
invoiceRoutes.get('/:id/payments', authenticate, invoiceController.listPayments);
