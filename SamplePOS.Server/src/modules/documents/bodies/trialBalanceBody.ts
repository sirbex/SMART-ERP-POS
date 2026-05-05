/**
 * TrialBalanceBody — list of all accounts with cumulative debits/credits.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface TrialBalanceRowData {
  accountCode: string;
  accountName: string;
  accountType: string;
  totalDebits: number;
  totalCredits: number;
  balance: number;
}

export interface TrialBalanceBodyData {
  asOfDate: string;
  rows: TrialBalanceRowData[];
}

export function renderTrialBalanceBody(
  ctx: LayoutContext,
  data: TrialBalanceBodyData,
): void {
  const { theme, doc, contentWidth } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' });

  Layout.kvGrid(ctx, [{ label: 'As of', value: fmtDate(data.asOfDate) }]);
  doc.moveDown(0.5);

  Layout.sectionTitle(ctx, 'Account Balances');

  if (data.rows.length === 0) {
    Layout.text(ctx, 'No account activity for this period.');
  } else {
    Layout.table(ctx, data.rows as unknown as Record<string, unknown>[], [
      { header: 'Code', key: 'accountCode' as const, width: 0.12 },
      { header: 'Account', key: 'accountName' as const, width: 0.34 },
      {
        header: 'Type',
        key: 'accountType' as const,
        width: 0.12,
        format: v => String(v).replace(/_/g, ' '),
      },
      {
        header: 'Debits',
        key: 'totalDebits' as const,
        width: 0.14,
        align: 'right' as const,
        format: v => fmt(v as number),
      },
      {
        header: 'Credits',
        key: 'totalCredits' as const,
        width: 0.14,
        align: 'right' as const,
        format: v => fmt(v as number),
      },
      {
        header: 'Balance',
        key: 'balance' as const,
        width: 0.14,
        align: 'right' as const,
        format: v => fmt(v as number),
      },
    ]);
  }

  const totalDebits = data.rows.reduce((s, r) => s + r.totalDebits, 0);
  const totalCredits = data.rows.reduce((s, r) => s + r.totalCredits, 0);
  const balanced = Math.abs(totalDebits - totalCredits) < 0.01;

  Layout.totalsBlock(ctx, [
    { label: 'Total Debits', value: fmt(totalDebits) },
    { label: 'Total Credits', value: fmt(totalCredits) },
    { label: 'Balanced', value: balanced ? 'Yes' : 'No', emphasize: true },
  ]);

  if (theme.copy.footerText) {
    doc.moveDown(0.3);
    Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
  }
}
