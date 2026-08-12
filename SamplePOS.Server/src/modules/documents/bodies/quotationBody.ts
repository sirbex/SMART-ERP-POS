/**
 * QuotationBody — customer quotation document.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';
import {
    hasQuotationLineDiscounts,
    hasTaxableQuotationLines,
} from '@shared/utils/quotationCalculations.js';
import { quotationPdfReferenceDisplay } from '@shared/utils/quotationReferenceDetails.js';

export interface QuotationBodyData {
    /** When false, tax column/row omitted (no taxable lines with tax). */
    showTax?: boolean;
    /** When false, discount column omitted (no line discounts). */
    showDiscount?: boolean;
    quotation: {
        quoteNumber: string;
        quoteType: string;
        status: string;
        validFrom: string | null;
        validUntil: string | null;
        customerName: string | null;
        customerEmail: string | null;
        customerPhone: string | null;
        reference: string | null;
        description: string | null;
        subtotal: number;
        discountAmount: number;
        taxAmount: number;
        totalAmount: number;
        paymentTerms: string | null;
        deliveryTerms: string | null;
        termsAndConditions: string | null;
    };
    items: Array<{
        lineNumber: number;
        sku: string | null;
        description: string;
        quantity: number;
        uomName: string | null;
        unitPrice: number;
        discountAmount: number;
        taxAmount: number;
        lineTotal: number;
        isTaxable?: boolean;
        taxRate?: number;
    }>;
}

type QuotationItem = QuotationBodyData['items'][number];
type QuotationItemTableColumn = {
    header: string;
    key: keyof QuotationItem;
    width?: number;
    align?: 'left' | 'right' | 'center';
    format?: (v: QuotationItem[keyof QuotationItem], row: QuotationItem) => string;
};

export function renderQuotationBody(ctx: LayoutContext, data: QuotationBodyData): void {
    const { theme, doc, contentWidth, contentLeft } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);
    const fmtDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

    const showTax =
        data.showTax
        ?? (hasTaxableQuotationLines(
            data.items.map((it) => ({
                quantity: it.quantity,
                unitPrice: it.unitPrice,
                discountAmount: it.discountAmount,
                isTaxable: it.isTaxable !== false,
                taxRate: it.taxRate ?? 0,
            })),
        ) && data.quotation.taxAmount > 0);
    const showDiscount = data.showDiscount ?? hasQuotationLineDiscounts(data.items);

    // ── Customer + document meta (reference on Quoted To card) ──
    const colW = (contentWidth - theme.spacing.lg) / 2;
    const startY = doc.y;

    const meta: Array<[string, string]> = [
        ['Quote Type', data.quotation.quoteType.toUpperCase()],
        ['Quotation Date', fmtDate(data.quotation.validFrom)],
        ['Expiry Date', fmtDate(data.quotation.validUntil)],
        ['Status', data.quotation.status],
    ];

    const customerLines = [
        data.quotation.customerName,
        data.quotation.customerEmail,
        data.quotation.customerPhone,
    ].filter((l): l is string => Boolean(l));
    const userReference = data.quotation.reference?.trim() || null;
    if (userReference) {
        meta.unshift(['Quotation No', data.quotation.quoteNumber]);
    }
    const referenceText = quotationPdfReferenceDisplay(
        data.quotation.reference,
        data.quotation.quoteNumber,
    );
    const leftContentRows = customerLines.length + 2;
    const panelHeight = Math.max(
        20 + leftContentRows * 13 + 16,
        20 + meta.length * 16 + 8,
    );

    doc
        .roundedRect(contentLeft, startY, colW, panelHeight, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    doc
        .fillColor(theme.colors.primary)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.sm)
        .text('QUOTED TO', contentLeft + 8, startY + 8, { width: colW - 16 });
    doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
    let by = startY + 24;
    customerLines.slice(0, 4).forEach(l => {
        doc.text(l, contentLeft + 8, by, { width: colW - 16, ellipsis: true });
        by += 13;
    });
    by += 4;
    doc
        .fillColor(theme.colors.muted)
        .font(theme.fonts.family)
        .fontSize(theme.fonts.size.xs)
        .text('Reference', contentLeft + 8, by, { width: colW - 16 });
    by += 12;
    doc
        .fillColor(theme.colors.text)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.base)
        .text(referenceText, contentLeft + 8, by, { width: colW - 16 });

    const rightX = contentLeft + colW + theme.spacing.lg;
    doc
        .roundedRect(rightX, startY, colW, panelHeight, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    let my = startY + 8;
    meta.forEach(([label, value]) => {
        doc
            .fillColor(theme.colors.muted)
            .font(theme.fonts.family)
            .fontSize(theme.fonts.size.xs)
            .text(label, rightX + 8, my, { width: colW * 0.42 });
        doc
            .fillColor(theme.colors.text)
            .font(theme.fonts.familyBold)
            .fontSize(theme.fonts.size.base)
            .text(value, rightX + colW * 0.42 + 8, my, {
                width: colW * 0.58 - 16,
                align: 'right',
            });
        my += 16;
    });
    doc.x = contentLeft;
    doc.y = startY + panelHeight + theme.spacing.lg;

    if (data.quotation.description?.trim()) {
        Layout.sectionTitle(ctx, 'Notes');
        Layout.text(ctx, data.quotation.description.trim(), { width: contentWidth });
        doc.moveDown(0.3);
    }

    // ── Items (discount/tax columns only when relevant) ──
    Layout.sectionTitle(ctx, 'Items');
    Layout.table(ctx, data.items, buildQuotationItemColumns(showDiscount, showTax, fmt));

    // ── Totals ──
    Layout.totalsBlock(ctx, [
        { label: 'Subtotal', value: fmt(data.quotation.subtotal) },
        ...(showDiscount && data.quotation.discountAmount > 0
            ? [{ label: 'Discount', value: `-${fmt(data.quotation.discountAmount)}` }]
            : []),
        ...(showTax && theme.flags.showTaxBreakdown && data.quotation.taxAmount > 0
            ? [{ label: 'Tax', value: fmt(data.quotation.taxAmount) }]
            : []),
        { label: 'Total', value: fmt(data.quotation.totalAmount), emphasize: true },
    ]);

    // ── Terms ──
    if (data.quotation.paymentTerms) {
        Layout.sectionTitle(ctx, 'Payment Terms');
        Layout.text(ctx, data.quotation.paymentTerms);
        doc.moveDown(0.3);
    }
    if (data.quotation.deliveryTerms) {
        Layout.sectionTitle(ctx, 'Delivery Terms');
        Layout.text(ctx, data.quotation.deliveryTerms);
        doc.moveDown(0.3);
    }
    const terms = data.quotation.termsAndConditions ?? theme.copy.termsAndConditions;
    if (terms) {
        Layout.sectionTitle(ctx, 'Terms & Conditions');
        Layout.text(ctx, terms, { width: contentWidth });
    }
}

function buildQuotationItemColumns(
    showDiscount: boolean,
    showTax: boolean,
    fmt: (n: number) => string,
): QuotationItemTableColumn[] {
    const extraCols = (showDiscount ? 1 : 0) + (showTax ? 1 : 0);
    // Money columns must fit "UGX 9,999,999.00". Old 0.12 Unit Price clipped to "UGX…".
    const moneyW = extraCols === 0 ? 0.22 : extraCols === 1 ? 0.16 : 0.14;
    const extraMoneyW = extraCols === 0 ? 0 : extraCols === 1 ? 0.14 : 0.12;
    const descWidth = 1 - (0.05 + 0.08 + 0.08 + moneyW + extraCols * extraMoneyW + moneyW);

    const cols: QuotationItemTableColumn[] = [
        { header: '#', key: 'lineNumber' as const, width: 0.05, align: 'right' as const, format: v => String(v) },
        { header: 'Description', key: 'description' as const, width: descWidth },
        { header: 'Qty', key: 'quantity' as const, width: 0.08, align: 'right' as const, format: (v) => String(v) },
        {
            header: 'UoM', key: 'uomName' as const, width: 0.08, align: 'left' as const,
            format: (v) => (v as string)?.trim() || '—',
        },
        { header: 'Unit Price', key: 'unitPrice' as const, width: moneyW, align: 'right' as const, format: v => fmt(v as number) },
    ];

    if (showDiscount) {
        cols.push({
            header: 'Discount', key: 'discountAmount' as const, width: extraMoneyW, align: 'right' as const,
            format: (v) => {
                const n = v as number;
                return n > 0 ? `-${fmt(n)}` : '—';
            },
        });
    }
    if (showTax) {
        cols.push({
            header: 'Tax', key: 'taxAmount' as const, width: extraMoneyW, align: 'right' as const,
            format: (v) => {
                const n = v as number;
                return n > 0 ? fmt(n) : '—';
            },
        });
    }

    cols.push({
        header: 'Line Total', key: 'lineTotal' as const, width: moneyW, align: 'right' as const,
        format: v => fmt(v as number),
    });

    return cols;
}
