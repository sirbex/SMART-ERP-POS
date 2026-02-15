// Invoice Settings Routes

import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
import * as invoiceSettingsController from './invoiceSettingsController.js';

export const invoiceSettingsRoutes = Router();

// Get invoice settings - any authenticated user can view
invoiceSettingsRoutes.get('/', authenticate, invoiceSettingsController.getInvoiceSettings);

// Update invoice settings - ADMIN only
invoiceSettingsRoutes.put(
  '/',
  authenticate,
  authorize('ADMIN'),
  invoiceSettingsController.updateInvoiceSettings
);
