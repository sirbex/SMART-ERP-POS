/**
 * CustomerStatementBody — periodic customer account statement.
 *
 * Shows opening balance, dated entries (invoice/payment/credit-note/etc.) with
 * running balance, and closing balance. Driven by Layout primitives only.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface CustomerStatementBodyData {
    customer: {
        name: string;
        email: string | null;
        phone: string | null;
        address: string | null;
    };
    period: {
        start: string; // YYYY-MM-DD
        end: string;
    };
    openingBalance: number;
    closingBalance: number;
    entries: Array<{
        date: string;
        type: string;
        reference: string | null;
        description: string | null;
        debit: number;
        credit: number;
        balanceAfter: number;
    }>;
}

export function renderCustomerStatementBody(
    ctx: LayoutContext,
    data: CustomerStatementBodyData,
): void {
    renderStatementBody(ctx, {
        partyLabel: 'CUSTOMER',
        party: data.customer,
        period: data.period,
        openingBalance: data.openingBalance,
        closingBalance: data.closingBalance,
        entries: data.entries,
        debitLabel: 'Charges',
        creditLabel: 'Payments',
    });
}

// Shared internal renderer reused by SupplierStatementBody.
export interface StatementRenderInput {
    partyLabel: string;
    party: { name: string; email: string | null; phone: string | null; address: string | null };
    period: { start: string; end: string };
    openingBalance: number;
    closingBalance: number;
    debitLabel: string;
    creditLabel: string;
    entries: Array<{
        date: string;
        type: string;
        reference: string | null;
        description: string | null;
        debit: number;
        credit: number;
        balanceAfter: number;
    }>;
}

export function renderStatementBody(
    ctx: LayoutContext,
    data: StatementRenderInput,
): void {
    const { theme, doc, contentWidth, contentLeft } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);

    // Compact amount formatter — strips the currency symbol for table cells so
    // "UGX 148,000" (≈70 pt) becomes "148,000" (≈38 pt), preventing truncation.
    // Currency is noted in the section subtitle below.
    const fmtAmt = (n: number): string => fmt(n).replace(/^[A-Z]{1,4}\s*/, '');

    // Compact date: parse YYYY-MM-DD directly (no Date constructor) → "3 Jan 26"
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDate = (d: string | null | undefined): string => {
        if (!d) return '—';
        const iso = String(d).split('T')[0];
        const [y, m, day] = iso.split('-').map(Number);
        if (!y || !m || !day) return iso;
        return `${day} ${MONTHS[m - 1]} ${String(y).slice(2)}`;
    };

    // ── Party + period panels ──
    const colW = (contentWidth - theme.spacing.lg) / 2;
    const startY = doc.y;

    doc
        .roundedRect(contentLeft, startY, colW, 80, 4)
        .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
    doc
        .fillColor(theme.colors.primary)
        .font(theme.fonts.familyBold)
        .fontSize(theme.fonts.size.sm)
        .text(data.partyLabel, contentLeft + 8, startY + 8, { width: colW - 16 });
    const partyLines = [data.party.name, data.party.address, data.party.phone, data.party.email]
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
        ['Period Start', fmtDate(data.period.start)],
        ['Period End', fmtDate(data.period.end)],
        ['Opening Balance', fmt(data.openingBalance)],
        ['Closing Balance', fmt(data.closingBalance)],
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

    // ── Entries table ──
    Layout.sectionTitle(ctx, 'Account Activity');
    // Currency note printed right-aligned on the same visual line
    doc
        .fillColor(theme.colors.muted)
        .font(theme.fonts.family)
        .fontSize(theme.fonts.size.xs)
        .text('All amounts in UGX', contentLeft, doc.y - theme.spacing.lg - 2, {
            width: contentWidth,
            align: 'right',
            lineBreak: false,
        });

    // Opening balance row + entries
    type Row = StatementRenderInput['entries'][number];
    const rows: Row[] = [
        {
            date: data.period.start,
            type: 'OPENING',
            reference: null,
            description: 'Opening Balance',
            debit: 0,
            credit: 0,
            balanceAfter: data.openingBalance,
        },
        ...data.entries,
    ];

    // Abbreviate long type labels to fit the Type column
    const fmtType = (v: unknown): string => {
        const s = String(v).replace(/_/g, ' ');
        const abbrevs: Record<string, string> = {
            'SUPPLIER OPENING BALANCE': 'SUPPLIER OB',
            'CUSTOMER OPENING BALANCE': 'CUSTOMER OB',
            'OPENING BALANCE': 'OPENING',
            'SUPPLIER INVOICE': 'INVOICE',
            'SUPPLIER PAYMENT': 'PAYMENT',
            'GOODS RECEIPT': 'GOODS RCPT',
            'RETURN GRN': 'RETURN GRN',
            'CREDIT NOTE': 'CREDIT NOTE',
            'CORRECTION': 'CORRECTION',
        };
        return abbrevs[s] ?? s;
    };

    // Column widths (must sum to 1.0).
    // Money columns each get 0.14 × 515 pt = 72 pt → cell width 64 pt.
    // Compact amounts like "275,500" are only ~38 pt so they fit with room to spare.
    Layout.table(ctx, rows, [
        {
            header: 'Date',
            key: 'date' as const,
            width: 0.11,
            format: v => fmtDate(v as string | null),
        },
        {
            header: 'Type',
            key: 'type' as const,
            width: 0.13,
            format: fmtType,
        },
        {
            header: 'Reference',
            key: 'reference' as const,
            width: 0.12,
            format: v => (v as string) || '—',
        },
        {
            header: 'Description',
            key: 'description' as const,
            width: 0.22,
            format: v => (v as string) || '—',
        },
        {
            header: data.debitLabel,
            key: 'debit' as const,
            width: 0.14,
            align: 'right' as const,
            format: v => ((v as number) ? fmtAmt(v as number) : '—'),
        },
        {
            header: data.creditLabel,
            key: 'credit' as const,
            width: 0.14,
            align: 'right' as const,
            format: v => ((v as number) ? fmtAmt(v as number) : '—'),
        },
        {
            header: 'Balance',
            key: 'balanceAfter' as const,
            width: 0.14,
            align: 'right' as const,
            format: v => fmtAmt(v as number),
        },
    ]);

    // ── Closing summary ──
    Layout.totalsBlock(ctx, [
        { label: 'Opening Balance', value: fmt(data.openingBalance) },
        { label: 'Closing Balance', value: fmt(data.closingBalance), emphasize: true },
    ]);

    if (theme.copy.footerText) {
        doc.moveDown(0.5);
        Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
    }
}
