// System Settings TypeScript Interfaces

export interface TaxRate {
    name: string;
    rate: number;
    default?: boolean;
    description?: string;
}

export interface SystemSettings {
    id: string;

    // General Settings
    businessName: string;
    currencyCode: string;
    currencySymbol: string;
    dateFormat: string;
    timeFormat: string;
    timezone: string;

    // Tax Settings
    taxEnabled: boolean;
    defaultTaxRate: number;
    taxName: string;
    taxNumber?: string;
    taxInclusive: boolean;
    taxRates: TaxRate[];

    // Printing Settings - Receipt
    receiptPrinterEnabled: boolean;
    receiptPrinterName?: string;
    receiptPaperWidth: number;
    receiptAutoPrint: boolean;
    receiptShowLogo: boolean;
    receiptLogoUrl?: string;
    receiptHeaderText?: string;
    receiptFooterText?: string;
    receiptShowTaxBreakdown: boolean;
    receiptShowQrCode: boolean;

    // Printing Settings - Invoice
    invoicePrinterEnabled: boolean;
    invoicePrinterName?: string;
    invoicePaperSize: string;
    invoiceTemplate: string;
    invoiceShowLogo: boolean;
    invoiceShowPaymentTerms: boolean;
    invoiceDefaultPaymentTerms?: string;

    // POS Session Policy
    posSessionPolicy: 'DISABLED' | 'PER_CASHIER_SESSION' | 'PER_COUNTER_SHARED_SESSION' | 'GLOBAL_STORE_SESSION';

    // POS Transaction Mode (SAP-style order→payment split)
    posTransactionMode: 'DirectSale' | 'OrderToPayment';

    // Low Stock Alerts
    lowStockAlertsEnabled: boolean;
    lowStockThreshold: number;

    // Audit
    createdAt: string;
    updatedAt: string;
    updatedById?: string;
}

export interface SystemSettingsDbRow {
    id: string;
    business_name: string;
    currency_code: string;
    currency_symbol: string;
    date_format: string;
    time_format: string;
    timezone: string;
    tax_enabled: boolean;
    default_tax_rate: string;
    tax_name: string;
    tax_number?: string;
    tax_inclusive: boolean;
    tax_rates: TaxRate[];
    receipt_printer_enabled: boolean;
    receipt_printer_name?: string;
    receipt_paper_width: number;
    receipt_auto_print: boolean;
    receipt_show_logo: boolean;
    receipt_logo_url?: string;
    receipt_header_text?: string;
    receipt_footer_text?: string;
    receipt_show_tax_breakdown: boolean;
    receipt_show_qr_code: boolean;
    invoice_printer_enabled: boolean;
    invoice_printer_name?: string;
    invoice_paper_size: string;
    invoice_template: string;
    invoice_show_logo: boolean;
    invoice_show_payment_terms: boolean;
    invoice_default_payment_terms?: string;
    pos_session_policy: string;
    pos_transaction_mode: string;
    low_stock_alerts_enabled: boolean;
    low_stock_threshold: number;
    created_at: string;
    updated_at: string;
    updated_by_id?: string;
}

export interface UpdateSystemSettingsDto {
    businessName?: string;
    currencyCode?: string;
    currencySymbol?: string;
    dateFormat?: string;
    timeFormat?: string;
    timezone?: string;
    taxEnabled?: boolean;
    defaultTaxRate?: number;
    taxName?: string;
    taxNumber?: string;
    taxInclusive?: boolean;
    taxRates?: TaxRate[];
    receiptPrinterEnabled?: boolean;
    receiptPrinterName?: string;
    receiptPaperWidth?: number;
    receiptAutoPrint?: boolean;
    receiptShowLogo?: boolean;
    receiptLogoUrl?: string;
    receiptHeaderText?: string;
    receiptFooterText?: string;
    receiptShowTaxBreakdown?: boolean;
    receiptShowQrCode?: boolean;
    invoicePrinterEnabled?: boolean;
    invoicePrinterName?: string;
    invoicePaperSize?: string;
    invoiceTemplate?: string;
    invoiceShowLogo?: boolean;
    invoiceShowPaymentTerms?: boolean;
    invoiceDefaultPaymentTerms?: string;
    posSessionPolicy?: 'DISABLED' | 'PER_CASHIER_SESSION' | 'PER_COUNTER_SHARED_SESSION' | 'GLOBAL_STORE_SESSION';
    posTransactionMode?: 'DirectSale' | 'OrderToPayment';
    lowStockAlertsEnabled?: boolean;
    lowStockThreshold?: number;
    updatedById?: string;
}

export function normalizeSystemSettings(dbRow: SystemSettingsDbRow): SystemSettings {
    return {
        id: dbRow.id,
        businessName: dbRow.business_name,
        currencyCode: dbRow.currency_code,
        currencySymbol: dbRow.currency_symbol,
        dateFormat: dbRow.date_format,
        timeFormat: dbRow.time_format,
        timezone: dbRow.timezone,
        taxEnabled: dbRow.tax_enabled,
        defaultTaxRate: parseFloat(dbRow.default_tax_rate),
        taxName: dbRow.tax_name,
        taxNumber: dbRow.tax_number,
        taxInclusive: dbRow.tax_inclusive,
        taxRates: dbRow.tax_rates || [],
        receiptPrinterEnabled: dbRow.receipt_printer_enabled,
        receiptPrinterName: dbRow.receipt_printer_name,
        receiptPaperWidth: dbRow.receipt_paper_width,
        receiptAutoPrint: dbRow.receipt_auto_print,
        receiptShowLogo: dbRow.receipt_show_logo,
        receiptLogoUrl: dbRow.receipt_logo_url,
        receiptHeaderText: dbRow.receipt_header_text,
        receiptFooterText: dbRow.receipt_footer_text,
        receiptShowTaxBreakdown: dbRow.receipt_show_tax_breakdown,
        receiptShowQrCode: dbRow.receipt_show_qr_code,
        invoicePrinterEnabled: dbRow.invoice_printer_enabled,
        invoicePrinterName: dbRow.invoice_printer_name,
        invoicePaperSize: dbRow.invoice_paper_size,
        invoiceTemplate: dbRow.invoice_template,
        invoiceShowLogo: dbRow.invoice_show_logo,
        invoiceShowPaymentTerms: dbRow.invoice_show_payment_terms,
        invoiceDefaultPaymentTerms: dbRow.invoice_default_payment_terms,
        posSessionPolicy: (dbRow.pos_session_policy || 'DISABLED') as SystemSettings['posSessionPolicy'],
        posTransactionMode: (dbRow.pos_transaction_mode || 'DirectSale') as SystemSettings['posTransactionMode'],
        lowStockAlertsEnabled: dbRow.low_stock_alerts_enabled,
        lowStockThreshold: dbRow.low_stock_threshold,
        createdAt: dbRow.created_at,
        updatedAt: dbRow.updated_at,
        updatedById: dbRow.updated_by_id,
    };
}
