/**
 * CreditNoteBody — customer credit note OR debit note (and supplier counterparts).
 *
 * Adapts header copy via the `documentType` field. The same layout serves
 * CREDIT_NOTE / DEBIT_NOTE / SUPPLIER_CREDIT_NOTE / SUPPLIER_DEBIT_NOTE.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface CreditNoteBodyData {
    note: {
        invoiceNumber: string;
        documentType: string;
        referenceInvoiceNumber: string | null;
        issueDate: string | null;
        status: string;
        subtotal: number;
        taxAmount: number;
        totalAmount: number;
        reason: string | null;
        notes: string | null;
        returnsGoods: boolean;
    };
    party: {
        label: string; // "Customer" or "Supplier"
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
    };
    items: Array<{
        lineNumber: number;
        productName: string;
        description: string | null;
        quantity: number;
        unitPrice: number;
        taxAmount: number;
        lineTotal: number;
    }>;
}

export function renderCreditNoteBody(ctx: LayoutContext, data: CreditNoteBodyData): void {
    const { theme, doc, contentWidth, contentLeft } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);
    const fmtDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

    // ── Party + meta panels ──
    const colW = (contentWidth - theme.spacing.lg) / 2;
    const startY = doc.y;

    doc
        .roundedRect(contentLeft, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    doc
        .fillColor(theme.colors.primary)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.sm)
        .text(data.party.label.toUpperCase(), contentLeft + 8, startY + 8, { width: colW - 16 });
    const partyLines = [data.party.name, data.party.email, data.party.phone, data.party.address]
        .filter((l): l is string => Boolean(l));
    doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
    let by = startY + 24;
    partyLines.slice(0, 4).forEach(l => {
        doc.text(l, contentLeft + 8, by, { width: colW - 16, ellipsis: true });
        by += 13;
    });

    const rightX = contentLeft + colW + theme.spacing.lg;
    doc
        .roundedRect(rightX, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    const meta: Array<[string, string]> = [
        ['Issue Date', fmtDate(data.note.issueDate)],
        ['Reference Invoice', data.note.referenceInvoiceNumber ?? '—'],
        ['Status', data.note.status],
        ['Returns Goods', data.note.returnsGoods ? 'Yes' : 'No'],
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

    if (data.note.reason) {
        Layout.sectionTitle(ctx, 'Reason');
        Layout.text(ctx, data.note.reason);
        doc.moveDown(0.3);
    }

    // ── Items ──
    Layout.sectionTitle(ctx, 'Items');
    Layout.table(
        ctx,
        data.items,
        [
            { header: '#', key: 'lineNumber' as const, width: 0.06, align: 'right' as const, format: v => String(v) },
            {
                header: 'Description', key: 'productName' as const, width: 0.45, format: (_v, row) => {
                    const r = row as CreditNoteBodyData['items'][number];
                    return r.description || r.productName || '—';
                }
            },
            { header: 'Qty', key: 'quantity' as const, width: 0.1, align: 'right' as const, format: v => String(v) },
            { header: 'Unit Price', key: 'unitPrice' as const, width: 0.14, align: 'right' as const, format: v => fmt(v as number) },
            { header: 'Total', key: 'lineTotal' as const, width: 0.25, align: 'right' as const, format: v => fmt(v as number) },
        ],
    );

    // ── Totals ──
    Layout.totalsBlock(ctx, [
        { label: 'Subtotal', value: fmt(data.note.subtotal) },
        ...(theme.flags.showTaxBreakdown && data.note.taxAmount > 0
            ? [{ label: 'Tax', value: fmt(data.note.taxAmount) }]
            : []),
        { label: 'Total', value: fmt(data.note.totalAmount), emphasize: true },
    ]);

    if (data.note.notes) {
        Layout.sectionTitle(ctx, 'Notes');
        Layout.text(ctx, data.note.notes);
        doc.moveDown(0.3);
    }
}
