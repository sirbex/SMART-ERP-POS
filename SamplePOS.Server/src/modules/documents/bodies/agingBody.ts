/**
 * AgingBody — Aged Receivables / Aged Payables report.
 * Renders summary buckets, per-entity totals, and per-invoice detail.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface AgingEntityRow {
    entityName: string;
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    over90: number;
    total: number;
}

export interface AgingDetailRow {
    entityName: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    daysOverdue: number;
    outstandingAmount: number;
    bucket: string;
}

export interface AgingBodyData {
    reportType: 'RECEIVABLE' | 'PAYABLE';
    asOfDate: string;
    summary: {
        current: number;
        days1to30: number;
        days31to60: number;
        days61to90: number;
        over90: number;
        grandTotal: number;
        entityCount: number;
    };
    entities: AgingEntityRow[];
    details: AgingDetailRow[];
}

export function renderAgingBody(ctx: LayoutContext, data: AgingBodyData): void {
    const { theme, doc, contentWidth } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);
    const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' });

    const partyHeading = data.reportType === 'RECEIVABLE' ? 'Customer' : 'Supplier';

    Layout.kvGrid(ctx, [
        {
            label: 'Report Type',
            value: data.reportType === 'RECEIVABLE' ? 'Aged Receivables' : 'Aged Payables',
        },
        { label: 'As of', value: fmtDate(data.asOfDate) },
        { label: `${partyHeading} Count`, value: String(data.summary.entityCount) },
    ]);
    doc.moveDown(0.5);

    // ── Bucket summary ──
    Layout.sectionTitle(ctx, 'Aging Summary');
    Layout.totalsBlock(ctx, [
        { label: 'Current', value: fmt(data.summary.current) },
        { label: '1–30 Days', value: fmt(data.summary.days1to30) },
        { label: '31–60 Days', value: fmt(data.summary.days31to60) },
        { label: '61–90 Days', value: fmt(data.summary.days61to90) },
        { label: '90+ Days', value: fmt(data.summary.over90) },
        { label: 'Grand Total', value: fmt(data.summary.grandTotal), emphasize: true },
    ]);

    // ── Per-entity breakdown ──
    Layout.sectionTitle(ctx, `By ${partyHeading}`);
    if (data.entities.length === 0) {
        Layout.text(ctx, 'No outstanding balances.');
    } else {
        Layout.table(ctx, data.entities as unknown as Record<string, unknown>[], [
            { header: partyHeading, key: 'entityName' as const, width: 0.28 },
            {
                header: 'Current',
                key: 'current' as const,
                width: 0.12,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
            {
                header: '1–30',
                key: 'days1to30' as const,
                width: 0.12,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
            {
                header: '31–60',
                key: 'days31to60' as const,
                width: 0.12,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
            {
                header: '61–90',
                key: 'days61to90' as const,
                width: 0.12,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
            {
                header: '90+',
                key: 'over90' as const,
                width: 0.12,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
            {
                header: 'Total',
                key: 'total' as const,
                width: 0.12,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
        ]);
    }

    // ── Detail (cap to a reasonable count to keep PDFs manageable) ──
    const detailCap = 200;
    const details = data.details.slice(0, detailCap);
    Layout.sectionTitle(ctx, 'Outstanding Invoices');
    if (details.length === 0) {
        Layout.text(ctx, 'No outstanding invoices.');
    } else {
        Layout.table(ctx, details as unknown as Record<string, unknown>[], [
            { header: partyHeading, key: 'entityName' as const, width: 0.22 },
            { header: 'Invoice #', key: 'invoiceNumber' as const, width: 0.14 },
            {
                header: 'Invoice Date',
                key: 'invoiceDate' as const,
                width: 0.12,
                format: v => fmtDate(v as string),
            },
            {
                header: 'Due Date',
                key: 'dueDate' as const,
                width: 0.12,
                format: v => fmtDate(v as string),
            },
            {
                header: 'Days',
                key: 'daysOverdue' as const,
                width: 0.08,
                align: 'right' as const,
                format: v => String(Math.max(0, v as number)),
            },
            { header: 'Bucket', key: 'bucket' as const, width: 0.16 },
            {
                header: 'Outstanding',
                key: 'outstandingAmount' as const,
                width: 0.16,
                align: 'right' as const,
                format: v => fmt(v as number),
            },
        ]);
    }

    if (data.details.length > detailCap) {
        doc.moveDown(0.3);
        Layout.text(
            ctx,
            `Showing first ${detailCap} of ${data.details.length} invoices. Export to spreadsheet for full detail.`,
        );
    }

    if (theme.copy.footerText) {
        doc.moveDown(0.3);
        Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
    }
}
