/**
 * InvoiceBody — semantic structure ONLY for the customer invoice document.
 *
 * Reads ONLY from `LayoutContext` and `Layout` primitives. No raw pdfkit calls,
 * no hex colors, no inline styles. Theme owns all appearance.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';
import { referenceSnapshotLines } from '@shared/utils/quotationReferenceDetails.js';

export interface InvoiceBodyData {
    invoice: {
        invoiceNumber: string;
        issueDate: string | null;
        dueDate: string | null;
        status: string;
        subtotal: number;
        taxAmount: number;
        discountAmount: number;
        totalAmount: number;
        amountPaid: number;
        amountDue: number;
        notes: string | null;
    };
    /** Populated when invoice originates from a quotation conversion. */
    sourceQuotation?: {
        quoteNumber: string;
        referenceDetails: string | null;
    } | null;
    customer: {
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
    };
    items: Array<{
        productName: string | null;
        productCode: string | null;
        quantity: number;
        uomName?: string | null;
        unitPrice: number;
        lineTotal: number;
    }>;
    payments: Array<{
        paymentDate: string;
        paymentMethod: string;
        amount: number;
        reference?: string | null;
    }>;
}

export function renderInvoiceBody(ctx: LayoutContext, data: InvoiceBodyData): void {
    const { theme, doc, contentLeft, contentWidth } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);
    const fmtDate = (d: string | null) =>
        d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

    // ── Bill To + Invoice Meta (two columns) ──
    const colW = (contentWidth - theme.spacing.lg) / 2;
    const startY = doc.y;

    // Left: Bill To
    doc
        .roundedRect(contentLeft, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    doc
        .fillColor(theme.colors.primary)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.sm)
        .text('BILL TO', contentLeft + 8, startY + 8, { width: colW - 16 });
    const billLines = [data.customer.name, data.customer.email, data.customer.phone, data.customer.address]
        .filter((l): l is string => Boolean(l));
    doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
    let by = startY + 24;
    billLines.slice(0, 4).forEach(l => {
        doc.text(l, contentLeft + 8, by, { width: colW - 16, ellipsis: true });
        by += 13;
    });

    // Right: Invoice meta
    const rightX = contentLeft + colW + theme.spacing.lg;
    doc
        .roundedRect(rightX, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);

    const metaPairs: Array<[string, string]> = [
        ['Issue Date', fmtDate(data.invoice.issueDate)],
        ['Due Date', fmtDate(data.invoice.dueDate)],
        ['Status', data.invoice.status],
        ['Amount Due', fmt(data.invoice.amountDue)],
    ];
    let my = startY + 8;
    metaPairs.forEach(([label, value]) => {
        doc
            .fillColor(theme.colors.muted)
            .font(theme.fonts.family)
            .fontSize(theme.fonts.size.xs)
            .text(label, rightX + 8, my, { width: colW * 0.45 });
        doc
            .fillColor(theme.colors.text)
            .font(theme.fonts.familyBold)
            .fontSize(theme.fonts.size.base)
            .text(value, rightX + colW * 0.45 + 8, my, {
                width: colW * 0.55 - 16,
                align: 'right',
            });
        my += 16;
    });

    doc.y = startY + 80 + theme.spacing.lg;

    if (data.sourceQuotation) {
        Layout.sectionTitle(ctx, 'Source Quotation');
        Layout.kvGrid(ctx, [
            { label: 'Quotation Number', value: data.sourceQuotation.quoteNumber },
        ], { columns: 1 });
        Layout.referenceDetailsBlock(
            ctx,
            'Reference Details',
            referenceSnapshotLines(data.sourceQuotation.referenceDetails),
        );
    }

    // ── Line Items ──
    Layout.sectionTitle(ctx, 'Items');
    Layout.table(
        ctx,
        data.items,
        [
            {
                header: '#', key: 'productCode' as const, width: 0.1, format: (_v, row) => {
                    const r = row as InvoiceBodyData['items'][number];
                    return r.productCode || '—';
                }
            },
            { header: 'Description', key: 'productName' as const, width: 0.45, format: (v) => (v as string) || '—' },
            { header: 'Qty', key: 'quantity' as const, width: 0.1, align: 'right' as const, format: (v, row) => {
                const r = row as InvoiceBodyData['items'][number];
                return r.uomName ? `${v} ${r.uomName}` : String(v);
            } },
            { header: 'Unit Price', key: 'unitPrice' as const, width: 0.15, align: 'right' as const, format: (v) => fmt(v as number) },
            { header: 'Total', key: 'lineTotal' as const, width: 0.2, align: 'right' as const, format: (v) => fmt(v as number) },
        ],
    );

    // ── Totals ──
    Layout.totalsBlock(ctx, [
        { label: 'Subtotal', value: fmt(data.invoice.subtotal) },
        ...(data.invoice.discountAmount > 0
            ? [{ label: 'Discount', value: `-${fmt(data.invoice.discountAmount)}` }]
            : []),
        ...(theme.flags.showTaxBreakdown && data.invoice.taxAmount > 0
            ? [{ label: 'Tax', value: fmt(data.invoice.taxAmount) }]
            : []),
        { label: 'Total', value: fmt(data.invoice.totalAmount), emphasize: true },
        { label: 'Amount Paid', value: fmt(data.invoice.amountPaid) },
        { label: 'Amount Due', value: fmt(data.invoice.amountDue), emphasize: data.invoice.amountDue > 0 },
    ]);

    // ── Payment History ──
    if (data.payments.length > 0) {
        Layout.sectionTitle(ctx, 'Payments Received');
        Layout.table(
            ctx,
            data.payments,
            [
                { header: 'Date', key: 'paymentDate' as const, width: 0.2, format: (v) => fmtDate(v as string) },
                { header: 'Method', key: 'paymentMethod' as const, width: 0.25 },
                { header: 'Reference', key: 'reference' as const, width: 0.3, format: (v) => (v as string) || '—' },
                { header: 'Amount', key: 'amount' as const, width: 0.25, align: 'right' as const, format: (v) => fmt(v as number) },
            ],
        );
    }

    // ── Payment Instructions ──
    if (theme.flags.showPaymentInstructions) {
        const onInvoice = theme.paymentAccounts.filter(a => a.showOnInvoice);
        if (onInvoice.length > 0) {
            Layout.sectionTitle(ctx, 'Payment Instructions');
            Layout.kvGrid(
                ctx,
                onInvoice.flatMap(a => [
                    { label: a.provider, value: `${a.accountName} — ${a.accountNumber}${a.branchOrCode ? ` (${a.branchOrCode})` : ''}` },
                ]),
                { columns: 1 },
            );
            if (theme.copy.paymentInstructions) {
                Layout.text(ctx, theme.copy.paymentInstructions);
                doc.moveDown(0.5);
            }
        }
    }

    // ── Notes / Terms ──
    if (data.invoice.notes) {
        Layout.sectionTitle(ctx, 'Notes');
        Layout.text(ctx, data.invoice.notes);
        doc.moveDown(0.5);
    }
    if (theme.copy.termsAndConditions) {
        Layout.sectionTitle(ctx, 'Terms & Conditions');
        Layout.text(ctx, theme.copy.termsAndConditions, { width: contentWidth });
    }
}
