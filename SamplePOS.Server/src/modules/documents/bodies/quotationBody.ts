/**
 * QuotationBody — customer quotation document.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';
import { quotationReferenceDetailLines } from '@shared/utils/quotationReferenceDetails.js';

export interface QuotationBodyData {
    /** When false, tax row is omitted (matches UI when no line is taxable). */
    showTax?: boolean;
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
    }>;
}

export function renderQuotationBody(ctx: LayoutContext, data: QuotationBodyData): void {
    const { theme, doc, contentWidth, contentLeft } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);
    const fmtDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

    // ── Customer + meta panels ──
    const colW = (contentWidth - theme.spacing.lg) / 2;
    const startY = doc.y;

    doc
        .roundedRect(contentLeft, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    doc
        .fillColor(theme.colors.primary)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.sm)
        .text('QUOTED TO', contentLeft + 8, startY + 8, { width: colW - 16 });
    const lines = [
        data.quotation.customerName,
        data.quotation.customerEmail,
        data.quotation.customerPhone,
    ].filter((l): l is string => Boolean(l));
    doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
    let by = startY + 24;
    lines.slice(0, 4).forEach(l => {
        doc.text(l, contentLeft + 8, by, { width: colW - 16, ellipsis: true });
        by += 13;
    });

    const rightX = contentLeft + colW + theme.spacing.lg;
    doc
        .roundedRect(rightX, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    const meta: Array<[string, string]> = [
        ['Quote Type', data.quotation.quoteType.toUpperCase()],
        ['Quotation Date', fmtDate(data.quotation.validFrom)],
        ['Expiry Date', fmtDate(data.quotation.validUntil)],
        ['Status', data.quotation.status],
    ];
    let my = startY + 8;
    meta.forEach(([label, value]) => {
        doc
            .fillColor(theme.colors.muted)
            .font(theme.fonts.family)
            .fontSize(theme.fonts.size.xs)
            .text(label, rightX + 8, my, { width: colW * 0.45 });
        doc
            .fillColor(theme.colors.text)
            .font(theme.fonts.familyBold)
            .fontSize(theme.fonts.size.base)
            .text(value, rightX + colW * 0.45 + 8, my, { width: colW * 0.55 - 16, align: 'right' });
        my += 16;
    });
    doc.y = startY + 80 + theme.spacing.lg;

    Layout.referenceDetailsBlock(
        ctx,
        'Reference',
        quotationReferenceDetailLines(data.quotation.reference, data.quotation.description),
    );

    // ── Items ──
    Layout.sectionTitle(ctx, 'Items');
    Layout.table(
        ctx,
        data.items,
        [
            { header: '#', key: 'lineNumber' as const, width: 0.04, align: 'right' as const, format: v => String(v) },
            { header: 'Description', key: 'description' as const, width: 0.34 },
            {
                header: 'Qty', key: 'quantity' as const, width: 0.1, align: 'right' as const, format: (v, row) => {
                    const r = row as QuotationBodyData['items'][number];
                    return r.uomName ? `${r.quantity} ${r.uomName}` : String(r.quantity);
                }
            },
            { header: 'Unit Price', key: 'unitPrice' as const, width: 0.12, align: 'right' as const, format: v => fmt(v as number) },
            {
                header: 'Discount', key: 'discountAmount' as const, width: 0.1, align: 'right' as const,
                format: (v) => {
                    const n = v as number;
                    return n > 0 ? `-${fmt(n)}` : '—';
                },
            },
            {
                header: 'Tax', key: 'taxAmount' as const, width: 0.1, align: 'right' as const,
                format: (v) => {
                    const n = v as number;
                    return n > 0 ? fmt(n) : '—';
                },
            },
            { header: 'Line Total', key: 'lineTotal' as const, width: 0.2, align: 'right' as const, format: v => fmt(v as number) },
        ],
    );

    // ── Totals ──
    Layout.totalsBlock(ctx, [
        { label: 'Subtotal', value: fmt(data.quotation.subtotal) },
        ...(data.quotation.discountAmount > 0
            ? [{ label: 'Discount', value: `-${fmt(data.quotation.discountAmount)}` }]
            : []),
        ...(data.showTax !== false
            && theme.flags.showTaxBreakdown
            && data.quotation.taxAmount > 0
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
