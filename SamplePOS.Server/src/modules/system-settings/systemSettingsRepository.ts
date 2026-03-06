import { Pool } from 'pg';
import {
    SystemSettings,
    SystemSettingsDbRow,
    normalizeSystemSettings,
    UpdateSystemSettingsDto,
} from '../../../../shared/types/systemSettings.js';

export const systemSettingsRepository = {
    /**
     * Get system settings (singleton - always returns the first/only row)
     */
    async getSettings(pool: Pool): Promise<SystemSettings | null> {
        const result = await pool.query<SystemSettingsDbRow>(
            `SELECT * FROM system_settings LIMIT 1`
        );

        if (result.rows.length === 0) {
            return null;
        }

        return normalizeSystemSettings(result.rows[0]);
    },

    /**
     * Update system settings
     */
    async updateSettings(
        pool: Pool,
        updates: UpdateSystemSettingsDto
    ): Promise<SystemSettings> {
        // Build dynamic SET clause
        const setClauses: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 1;

        if (updates.businessName !== undefined) {
            setClauses.push(`business_name = $${paramIndex++}`);
            values.push(updates.businessName);
        }
        if (updates.currencyCode !== undefined) {
            setClauses.push(`currency_code = $${paramIndex++}`);
            values.push(updates.currencyCode);
        }
        if (updates.currencySymbol !== undefined) {
            setClauses.push(`currency_symbol = $${paramIndex++}`);
            values.push(updates.currencySymbol);
        }
        if (updates.dateFormat !== undefined) {
            setClauses.push(`date_format = $${paramIndex++}`);
            values.push(updates.dateFormat);
        }
        if (updates.timeFormat !== undefined) {
            setClauses.push(`time_format = $${paramIndex++}`);
            values.push(updates.timeFormat);
        }
        if (updates.timezone !== undefined) {
            setClauses.push(`timezone = $${paramIndex++}`);
            values.push(updates.timezone);
        }
        if (updates.taxEnabled !== undefined) {
            setClauses.push(`tax_enabled = $${paramIndex++}`);
            values.push(updates.taxEnabled);
        }
        if (updates.defaultTaxRate !== undefined) {
            setClauses.push(`default_tax_rate = $${paramIndex++}`);
            values.push(updates.defaultTaxRate);
        }
        if (updates.taxName !== undefined) {
            setClauses.push(`tax_name = $${paramIndex++}`);
            values.push(updates.taxName);
        }
        if (updates.taxNumber !== undefined) {
            setClauses.push(`tax_number = $${paramIndex++}`);
            values.push(updates.taxNumber);
        }
        if (updates.taxInclusive !== undefined) {
            setClauses.push(`tax_inclusive = $${paramIndex++}`);
            values.push(updates.taxInclusive);
        }
        if (updates.taxRates !== undefined) {
            setClauses.push(`tax_rates = $${paramIndex++}`);
            values.push(JSON.stringify(updates.taxRates));
        }
        if (updates.receiptPrinterEnabled !== undefined) {
            setClauses.push(`receipt_printer_enabled = $${paramIndex++}`);
            values.push(updates.receiptPrinterEnabled);
        }
        if (updates.receiptPrinterName !== undefined) {
            setClauses.push(`receipt_printer_name = $${paramIndex++}`);
            values.push(updates.receiptPrinterName);
        }
        if (updates.receiptPaperWidth !== undefined) {
            setClauses.push(`receipt_paper_width = $${paramIndex++}`);
            values.push(updates.receiptPaperWidth);
        }
        if (updates.receiptAutoPrint !== undefined) {
            setClauses.push(`receipt_auto_print = $${paramIndex++}`);
            values.push(updates.receiptAutoPrint);
        }
        if (updates.receiptShowLogo !== undefined) {
            setClauses.push(`receipt_show_logo = $${paramIndex++}`);
            values.push(updates.receiptShowLogo);
        }
        if (updates.receiptLogoUrl !== undefined) {
            setClauses.push(`receipt_logo_url = $${paramIndex++}`);
            values.push(updates.receiptLogoUrl);
        }
        if (updates.receiptHeaderText !== undefined) {
            setClauses.push(`receipt_header_text = $${paramIndex++}`);
            values.push(updates.receiptHeaderText);
        }
        if (updates.receiptFooterText !== undefined) {
            setClauses.push(`receipt_footer_text = $${paramIndex++}`);
            values.push(updates.receiptFooterText);
        }
        if (updates.receiptShowTaxBreakdown !== undefined) {
            setClauses.push(`receipt_show_tax_breakdown = $${paramIndex++}`);
            values.push(updates.receiptShowTaxBreakdown);
        }
        if (updates.receiptShowQrCode !== undefined) {
            setClauses.push(`receipt_show_qr_code = $${paramIndex++}`);
            values.push(updates.receiptShowQrCode);
        }
        if (updates.invoicePrinterEnabled !== undefined) {
            setClauses.push(`invoice_printer_enabled = $${paramIndex++}`);
            values.push(updates.invoicePrinterEnabled);
        }
        if (updates.invoicePrinterName !== undefined) {
            setClauses.push(`invoice_printer_name = $${paramIndex++}`);
            values.push(updates.invoicePrinterName);
        }
        if (updates.invoicePaperSize !== undefined) {
            setClauses.push(`invoice_paper_size = $${paramIndex++}`);
            values.push(updates.invoicePaperSize);
        }
        if (updates.invoiceTemplate !== undefined) {
            setClauses.push(`invoice_template = $${paramIndex++}`);
            values.push(updates.invoiceTemplate);
        }
        if (updates.invoiceShowLogo !== undefined) {
            setClauses.push(`invoice_show_logo = $${paramIndex++}`);
            values.push(updates.invoiceShowLogo);
        }
        if (updates.invoiceShowPaymentTerms !== undefined) {
            setClauses.push(`invoice_show_payment_terms = $${paramIndex++}`);
            values.push(updates.invoiceShowPaymentTerms);
        }
        if (updates.invoiceDefaultPaymentTerms !== undefined) {
            setClauses.push(`invoice_default_payment_terms = $${paramIndex++}`);
            values.push(updates.invoiceDefaultPaymentTerms);
        }
        if (updates.lowStockAlertsEnabled !== undefined) {
            setClauses.push(`low_stock_alerts_enabled = $${paramIndex++}`);
            values.push(updates.lowStockAlertsEnabled);
        }
        if (updates.lowStockThreshold !== undefined) {
            setClauses.push(`low_stock_threshold = $${paramIndex++}`);
            values.push(updates.lowStockThreshold);
        }
        if (updates.updatedById !== undefined) {
            setClauses.push(`updated_by_id = $${paramIndex++}`);
            values.push(updates.updatedById);
        }

        if (setClauses.length === 0) {
            throw new Error('No fields to update');
        }

        const query = `
      UPDATE system_settings 
      SET ${setClauses.join(', ')}
      WHERE id = (SELECT id FROM system_settings LIMIT 1)
      RETURNING *
    `;

        const result = await pool.query<SystemSettingsDbRow>(query, values);

        if (result.rows.length === 0) {
            throw new Error('Failed to update system settings');
        }

        return normalizeSystemSettings(result.rows[0]);
    },

    /**
     * Initialize default settings if table is empty
     */
    async initializeDefaults(pool: Pool): Promise<SystemSettings> {
        const existing = await this.getSettings(pool);
        if (existing) {
            return existing;
        }

        const result = await pool.query<SystemSettingsDbRow>(
            `INSERT INTO system_settings (
        business_name,
        currency_code,
        currency_symbol,
        tax_enabled,
        default_tax_rate,
        tax_name,
        tax_inclusive
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
            ['SamplePOS', 'UGX', 'UGX', false, 18.0, 'VAT', true]
        );

        return normalizeSystemSettings(result.rows[0]);
    },
};
