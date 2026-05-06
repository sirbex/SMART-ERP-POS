/**
 * Document Theme — single source of styling truth for ALL document outputs.
 *
 * This is the ONE place where typography, colors, spacing, paper sizes, and
 * branding metadata are defined. Every document body, every renderer, every
 * preview must consume this object — never hardcode hex codes, fonts, or
 * dimensions.
 *
 * Loaded from `invoice_settings` (DB) by `loadDocumentTheme()`.
 */

import type { Pool } from 'pg';
import { getSettings } from '../settings/invoiceSettingsService.js';

// =============================================================================
// PAPER SIZE
// =============================================================================

export type PaperSize = 'A4' | 'A5' | 'LETTER' | 'RECEIPT_80MM' | 'RECEIPT_58MM';

export interface PaperDefinition {
    size: PaperSize;
    /** pdfkit `size` value: 'A4' / 'LETTER' / [width, height] in points (1pt = 1/72 inch) */
    pdfkitSize: 'A4' | 'A5' | 'LETTER' | [number, number];
    /** Margin (top/right/bottom/left) in points */
    margin: { top: number; right: number; bottom: number; left: number };
    /** Width in points — derived for layout math */
    widthPt: number;
    /** Whether this is a thermal receipt format (single column, narrow) */
    isReceipt: boolean;
}

export const PAPER_DEFINITIONS: Record<PaperSize, PaperDefinition> = {
    A4: {
        size: 'A4',
        pdfkitSize: 'A4',
        margin: { top: 40, right: 40, bottom: 40, left: 40 },
        widthPt: 595,
        isReceipt: false,
    },
    A5: {
        size: 'A5',
        pdfkitSize: 'A5',
        margin: { top: 30, right: 30, bottom: 30, left: 30 },
        widthPt: 420,
        isReceipt: false,
    },
    LETTER: {
        size: 'LETTER',
        pdfkitSize: 'LETTER',
        margin: { top: 40, right: 40, bottom: 40, left: 40 },
        widthPt: 612,
        isReceipt: false,
    },
    RECEIPT_80MM: {
        size: 'RECEIPT_80MM',
        // 80mm wide × auto-height. 80mm = 226.77 pt; height grows with content.
        pdfkitSize: [227, 800],
        margin: { top: 8, right: 8, bottom: 8, left: 8 },
        widthPt: 227,
        isReceipt: true,
    },
    RECEIPT_58MM: {
        size: 'RECEIPT_58MM',
        pdfkitSize: [164, 800],
        margin: { top: 6, right: 6, bottom: 6, left: 6 },
        widthPt: 164,
        isReceipt: true,
    },
};

// =============================================================================
// THEME
// =============================================================================

export interface DocumentTheme {
    /** Branding metadata (rendered in header/footer) */
    company: {
        name: string;
        address: string;
        phone: string;
        email: string;
        tin: string;
        logoUrl: string | null;
    };

    /** Color palette — every color used in any document MUST come from here */
    colors: {
        primary: string;     // brand primary (header band, table heading, totals)
        secondary: string;   // brand secondary (accent strokes, badges)
        text: string;        // body text
        muted: string;       // secondary labels
        border: string;      // table borders, separators
        bgSubtle: string;    // alternating rows, callout backgrounds
        success: string;
        danger: string;
        warning: string;
    };

    /** Typography — single scale for all documents */
    fonts: {
        family: string;        // pdfkit standard font (we stick to Helvetica family for portability)
        familyBold: string;
        familyItalic: string;
        /** Font-size scale in pt */
        size: {
            xs: number;
            sm: number;
            base: number;
            md: number;
            lg: number;
            xl: number;
            '2xl': number;
            '3xl': number;
        };
    };

    /** Spacing scale in pt — use only these values */
    spacing: {
        xs: number;
        sm: number;
        md: number;
        lg: number;
        xl: number;
        '2xl': number;
    };

    /** Document chrome flags */
    flags: {
        showLogo: boolean;
        showTaxBreakdown: boolean;
        showPaymentInstructions: boolean;
        showPricesOnDeliveryNote: boolean;
    };

    /** Footer copy */
    copy: {
        paymentInstructions: string | null;
        termsAndConditions: string | null;
        footerText: string | null;
        customReceiptNote: string | null;
    };

    /** Active payment accounts (for invoices/receipts) */
    paymentAccounts: Array<{
        type: 'BANK' | 'MOBILE_MONEY' | 'WALLET';
        provider: string;
        accountName: string;
        accountNumber: string;
        branchOrCode?: string;
        showOnReceipt: boolean;
        showOnInvoice: boolean;
    }>;
}

// =============================================================================
// LOADER
// =============================================================================

const HEX = /^#[0-9A-Fa-f]{6}$/;
const safeColor = (input: string | null | undefined, fallback: string): string =>
    input && HEX.test(input) ? input : fallback;

/**
 * Load the active DocumentTheme from settings.
 * This is the ONLY function any renderer should call to obtain styling info.
 */
export async function loadDocumentTheme(pool: Pool): Promise<DocumentTheme> {
    const s = await getSettings(pool);

    const primary = safeColor(s.primaryColor, '#2563eb');
    const secondary = safeColor(s.secondaryColor, '#10b981');

    return {
        company: {
            name: s.companyName || 'SMART ERP',
            address: s.companyAddress ?? '',
            phone: s.companyPhone ?? '',
            email: s.companyEmail ?? '',
            tin: s.companyTin ?? '',
            logoUrl: s.companyLogoUrl ?? null,
        },
        colors: {
            primary,
            secondary,
            text: '#1f2937',
            muted: '#6b7280',
            border: '#e5e7eb',
            bgSubtle: '#f9fafb',
            success: '#10b981',
            danger: '#ef4444',
            warning: '#f59e0b',
        },
        fonts: {
            family: 'Helvetica',
            familyBold: 'Helvetica-Bold',
            familyItalic: 'Helvetica-Oblique',
            size: {
                xs: 7,
                sm: 8,
                base: 9,
                md: 10,
                lg: 12,
                xl: 14,
                '2xl': 18,
                '3xl': 24,
            },
        },
        spacing: {
            xs: 2,
            sm: 4,
            md: 8,
            lg: 12,
            xl: 16,
            '2xl': 24,
        },
        flags: {
            showLogo: s.showCompanyLogo ?? true,
            showTaxBreakdown: s.showTaxBreakdown ?? true,
            showPaymentInstructions: s.showPaymentInstructions ?? true,
            showPricesOnDeliveryNote: s.showPricesOnDnPdf ?? false,
        },
        copy: {
            paymentInstructions: s.paymentInstructions,
            termsAndConditions: s.termsAndConditions,
            footerText: s.footerText,
            customReceiptNote: s.customReceiptNote,
        },
        paymentAccounts: (s.paymentAccounts || [])
            .filter(a => a.isActive)
            .map(a => ({
                type: a.type,
                provider: a.provider,
                accountName: a.accountName,
                accountNumber: a.accountNumber,
                branchOrCode: a.branchOrCode,
                showOnReceipt: a.showOnReceipt,
                showOnInvoice: a.showOnInvoice,
            })),
    };
}
