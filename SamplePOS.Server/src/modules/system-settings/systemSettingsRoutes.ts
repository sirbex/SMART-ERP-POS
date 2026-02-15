import express from 'express';
import { systemSettingsController } from './systemSettingsController.js';
import { authenticate } from '../../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/system-settings - Get all settings
router.get('/', systemSettingsController.getSettings);

// PATCH /api/system-settings - Update settings
router.patch('/', systemSettingsController.updateSettings);

// GET /api/system-settings/tax - Get tax configuration
router.get('/tax', systemSettingsController.getTaxConfig);

// GET /api/system-settings/printing/receipt - Get receipt print config
router.get('/printing/receipt', systemSettingsController.getReceiptPrintConfig);

// GET /api/system-settings/printing/invoice - Get invoice print config
router.get('/printing/invoice', systemSettingsController.getInvoicePrintConfig);

export const systemSettingsRoutes = router;
