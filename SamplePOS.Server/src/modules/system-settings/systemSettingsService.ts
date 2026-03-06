import { Pool } from 'pg';
import { systemSettingsRepository } from './systemSettingsRepository.js';
import { SystemSettings, UpdateSystemSettingsDto } from '../../../../shared/types/systemSettings.js';
import logger from '../../utils/logger.js';
import { UnitOfWork } from '../../db/unitOfWork.js';

export const systemSettingsService = {
    /**
     * Get system settings
     */
    async getSettings(pool: Pool): Promise<SystemSettings> {
        const settings = await systemSettingsRepository.getSettings(pool);

        if (!settings) {
            // Initialize with defaults if not exists
            logger.info('System settings not found, initializing defaults');
            return await systemSettingsRepository.initializeDefaults(pool);
        }

        return settings;
    },

    /**
     * Update system settings
     */
    async updateSettings(
        pool: Pool,
        updates: UpdateSystemSettingsDto,
        userId?: string
    ): Promise<SystemSettings> {
        // Add userId to updates for audit trail
        const updatesWithUser = {
            ...updates,
            updatedById: userId,
        };

        // Transaction: Update settings atomically
        return UnitOfWork.run(pool, async (_client) => {
            const updated = await systemSettingsRepository.updateSettings(
                pool,
                updatesWithUser
            );

            logger.info('System settings updated (transaction committed)', {
                updatedBy: userId,
                changes: Object.keys(updates),
            });

            return updated;
        });
    },

    /**
     * Get tax configuration
     */
    async getTaxConfig(pool: Pool): Promise<{
        enabled: boolean;
        defaultRate: number;
        taxName: string;
        taxInclusive: boolean;
        rates: Array<{ name: string; rate: number; default?: boolean }>;
    }> {
        const settings = await this.getSettings(pool);

        return {
            enabled: settings.taxEnabled,
            defaultRate: settings.defaultTaxRate,
            taxName: settings.taxName,
            taxInclusive: settings.taxInclusive,
            rates: settings.taxRates,
        };
    },

    /**
     * Get printing configuration for receipts
     */
    async getReceiptPrintConfig(pool: Pool): Promise<{
        enabled: boolean;
        printerName?: string;
        paperWidth: number;
        autoPrint: boolean;
        showLogo: boolean;
        logoUrl?: string;
        headerText?: string;
        footerText?: string;
        showTaxBreakdown: boolean;
        showQrCode: boolean;
    }> {
        const settings = await this.getSettings(pool);

        return {
            enabled: settings.receiptPrinterEnabled,
            printerName: settings.receiptPrinterName,
            paperWidth: settings.receiptPaperWidth,
            autoPrint: settings.receiptAutoPrint,
            showLogo: settings.receiptShowLogo,
            logoUrl: settings.receiptLogoUrl,
            headerText: settings.receiptHeaderText,
            footerText: settings.receiptFooterText,
            showTaxBreakdown: settings.receiptShowTaxBreakdown,
            showQrCode: settings.receiptShowQrCode,
        };
    },

    /**
     * Get printing configuration for invoices
     */
    async getInvoicePrintConfig(pool: Pool): Promise<{
        enabled: boolean;
        printerName?: string;
        paperSize: string;
        template: string;
        showLogo: boolean;
        showPaymentTerms: boolean;
        defaultPaymentTerms?: string;
    }> {
        const settings = await this.getSettings(pool);

        return {
            enabled: settings.invoicePrinterEnabled,
            printerName: settings.invoicePrinterName,
            paperSize: settings.invoicePaperSize,
            template: settings.invoiceTemplate,
            showLogo: settings.invoiceShowLogo,
            showPaymentTerms: settings.invoiceShowPaymentTerms,
            defaultPaymentTerms: settings.invoiceDefaultPaymentTerms,
        };
    },
};
