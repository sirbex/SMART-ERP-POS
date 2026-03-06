import { Request, Response, NextFunction } from 'express';
import { systemSettingsService } from './systemSettingsService.js';
import { pool as globalPool } from '../../db/pool.js';

// Async wrapper — catches thrown errors and forwards to Express error handler
function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

export const systemSettingsController = {
    /**
     * GET /api/system-settings
     * Get system settings
     */
    getSettings: asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const settings = await systemSettingsService.getSettings(pool);
        res.json({ success: true, data: settings });
    }),

    /**
     * PATCH /api/system-settings
     * Update system settings
     */
    updateSettings: asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const userId = req.user?.id;
        const updates = req.body;

        const settings = await systemSettingsService.updateSettings(
            pool,
            updates,
            userId
        );

        res.json({
            success: true,
            data: settings,
            message: 'System settings updated successfully',
        });
    }),

    /**
     * GET /api/system-settings/tax
     * Get tax configuration
     */
    getTaxConfig: asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const taxConfig = await systemSettingsService.getTaxConfig(pool);
        res.json({ success: true, data: taxConfig });
    }),

    /**
     * GET /api/system-settings/printing/receipt
     * Get receipt printing configuration
     */
    getReceiptPrintConfig: asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const config = await systemSettingsService.getReceiptPrintConfig(pool);
        res.json({ success: true, data: config });
    }),

    /**
     * GET /api/system-settings/printing/invoice
     * Get invoice printing configuration
     */
    getInvoicePrintConfig: asyncHandler(async (req, res) => {
        const pool = req.tenantPool || globalPool;
        const config = await systemSettingsService.getInvoicePrintConfig(pool);
        res.json({ success: true, data: config });
    }),
};
