/**
 * BalanceSheetBody — point-in-time statement of financial position.
 * Sections: Assets / Liabilities / Equity. Confirms accounting equation.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface BalanceSheetAccountRow {
    accountCode: string;
    accountName: string;
    balance: number;
}

export interface BalanceSheetBodyData {
    asOfDate: string;
    assets: BalanceSheetAccountRow[];
    liabilities: BalanceSheetAccountRow[];
    equity: BalanceSheetAccountRow[];
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
}

export function renderBalanceSheetBody(
    ctx: LayoutContext,
    data: BalanceSheetBodyData,
): void {
    const { theme, doc, contentWidth } = ctx;
    const fmt = (n: number) => Money.formatCurrency(n);
    const fmtDate = (d: string) =>
        new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' });

    Layout.kvGrid(ctx, [{ label: 'As of', value: fmtDate(data.asOfDate) }]);
    doc.moveDown(0.5);

    const cols = [
        { header: 'Code', key: 'accountCode' as const, width: 0.18 },
        { header: 'Account', key: 'accountName' as const, width: 0.55 },
        {
            header: 'Balance',
            key: 'balance' as const,
            width: 0.27,
            align: 'right' as const,
            format: (v: unknown) => fmt(v as number),
        },
    ];

    const renderSection = (
        title: string,
        rows: BalanceSheetAccountRow[],
        total: number,
        totalLabel: string,
    ): void => {
        Layout.sectionTitle(ctx, title);
        if (rows.length === 0) {
            Layout.text(ctx, 'No accounts with balances in this section.');
        } else {
            Layout.table(ctx, rows as unknown as Record<string, unknown>[], cols);
        }
        Layout.totalsBlock(ctx, [{ label: totalLabel, value: fmt(total), emphasize: true }]);
    };

    renderSection('Assets', data.assets, data.totalAssets, 'Total Assets');
    renderSection('Liabilities', data.liabilities, data.totalLiabilities, 'Total Liabilities');
    renderSection('Equity', data.equity, data.totalEquity, 'Total Equity');

    const liabPlusEquity = data.totalLiabilities + data.totalEquity;
    const balanced = Math.abs(data.totalAssets - liabPlusEquity) < 0.01;

    Layout.totalsBlock(ctx, [
        { label: 'Total Assets', value: fmt(data.totalAssets), emphasize: true },
        {
            label: 'Total Liabilities + Equity',
            value: fmt(liabPlusEquity),
            emphasize: true,
        },
        { label: 'Balanced', value: balanced ? 'Yes' : 'No' },
    ]);

    if (theme.copy.footerText) {
        doc.moveDown(0.3);
        Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
    }
}
