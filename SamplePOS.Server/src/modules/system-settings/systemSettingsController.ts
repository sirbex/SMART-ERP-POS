import { Request, Response } from 'express';
import { systemSettingsService } from './systemSettingsService.js';
import { pool } from '../../db/pool.js';
import logger from '../../utils/logger.js';

export const systemSettingsController = {
    /**
     * GET /api/system-settings
     * Get system settings
     */
    async getSettings(req: Request, res: Response) {
        try {
            const settings = await systemSettingsService.getSettings(pool);

            res.json({
                success: true,
                data: settings,
            });
        } catch (error: any) {
            logger.error('Error fetching system settings', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch system settings',
            });
        }
    },

    /**
     * PATCH /api/system-settings
     * Update system settings
     */
    async updateSettings(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.id;
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
        } catch (error: any) {
            logger.error('Error updating system settings', {
                error: error.message,
                userId: (req as any).user?.id,
            });
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update system settings',
            });
        }
    },

    /**
     * GET /api/system-settings/tax
     * Get tax configuration
     */
    async getTaxConfig(req: Request, res: Response) {
        try {
            const taxConfig = await systemSettingsService.getTaxConfig(pool);

            res.json({
                success: true,
                data: taxConfig,
            });
        } catch (error: any) {
            logger.error('Error fetching tax config', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch tax configuration',
            });
        }
    },

    /**
     * GET /api/system-settings/printing/receipt
     * Get receipt printing configuration
     */
    async getReceiptPrintConfig(req: Request, res: Response) {
        try {
            const config = await systemSettingsService.getReceiptPrintConfig(pool);

            res.json({
                success: true,
                data: config,
            });
        } catch (error: any) {
            logger.error('Error fetching receipt print config', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch receipt printing configuration',
            });
        }
    },

    /**
     * GET /api/system-settings/printing/invoice
     * Get invoice printing configuration
     */
    async getInvoicePrintConfig(req: Request, res: Response) {
        try {
            const config = await systemSettingsService.getInvoicePrintConfig(pool);

            res.json({
                success: true,
                data: config,
            });
        } catch (error: any) {
            logger.error('Error fetching invoice print config', { error: error.message });
            res.status(500).json({
                success: false,
                error: 'Failed to fetch invoice printing configuration',
            });
        }
    },
};
