import express from 'express';
import { systemSettingsController } from './systemSettingsController.js';
import { authenticate } from '../../middleware/auth.js';
import { requirePermission } from '../../rbac/middleware.js';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// GET /api/system-settings - Get all settings
router.get('/', requirePermission('system.read'), systemSettingsController.getSettings);

// PATCH /api/system-settings - Update settings (admin only)
router.patch('/', requirePermission('admin.update'), systemSettingsController.updateSettings);

// GET /api/system-settings/tax - Get tax configuration
router.get('/tax', requirePermission('system.read'), systemSettingsController.getTaxConfig);

// GET /api/system-settings/printing/receipt - Get receipt print config
router.get('/printing/receipt', requirePermission('system.read'), systemSettingsController.getReceiptPrintConfig);

// GET /api/system-settings/printing/invoice - Get invoice print config
router.get('/printing/invoice', requirePermission('system.read'), systemSettingsController.getInvoicePrintConfig);

export const systemSettingsRoutes = router;
