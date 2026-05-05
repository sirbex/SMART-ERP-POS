/**
 * ProfitLossBody — period income statement.
 * Sections: Revenue → COGS → Gross Profit → Operating Expenses → Net Income.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface ProfitLossLineItemRow {
  accountCode: string;
  accountName: string;
  displayAmount: number;
}

export interface ProfitLossBodyData {
  periodStart: string;
  periodEnd: string;
  revenueAccounts: ProfitLossLineItemRow[];
  cogsAccounts: ProfitLossLineItemRow[];
  expenseAccounts: ProfitLossLineItemRow[];
  summary: {
    totalRevenue: number;
    totalCogs: number;
    grossProfit: number;
    grossMarginPercent: number;
    totalOperatingExpenses: number;
    operatingIncome: number;
    netIncome: number;
    netMarginPercent: number;
  };
}

export function renderProfitLossBody(
  ctx: LayoutContext,
  data: ProfitLossBodyData,
): void {
  const { theme, doc, contentWidth } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtPct = (n: number) => `${n.toFixed(2)}%`;
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' });

  Layout.kvGrid(ctx, [
    { label: 'Period Start', value: fmtDate(data.periodStart) },
    { label: 'Period End', value: fmtDate(data.periodEnd) },
  ]);
  doc.moveDown(0.5);

  const renderSection = (
    title: string,
    rows: ProfitLossLineItemRow[],
    total: number,
    totalLabel: string,
  ): void => {
    Layout.sectionTitle(ctx, title);
    if (rows.length === 0) {
      Layout.text(ctx, 'No activity in this section.');
    } else {
      Layout.table(ctx, rows as unknown as Record<string, unknown>[], [
        { header: 'Code', key: 'accountCode' as const, width: 0.18 },
        { header: 'Account', key: 'accountName' as const, width: 0.55 },
        {
          header: 'Amount',
          key: 'displayAmount' as const,
          width: 0.27,
          align: 'right' as const,
          format: v => fmt(v as number),
        },
      ]);
    }
    Layout.totalsBlock(ctx, [{ label: totalLabel, value: fmt(total), emphasize: true }]);
  };

  renderSection('Revenue', data.revenueAccounts, data.summary.totalRevenue, 'Total Revenue');
  renderSection(
    'Cost of Goods Sold',
    data.cogsAccounts,
    data.summary.totalCogs,
    'Total COGS',
  );

  Layout.totalsBlock(ctx, [
    { label: 'Gross Profit', value: fmt(data.summary.grossProfit), emphasize: true },
    { label: 'Gross Margin', value: fmtPct(data.summary.grossMarginPercent) },
  ]);

  renderSection(
    'Operating Expenses',
    data.expenseAccounts,
    data.summary.totalOperatingExpenses,
    'Total Operating Expenses',
  );

  Layout.totalsBlock(ctx, [
    { label: 'Operating Income', value: fmt(data.summary.operatingIncome) },
    { label: 'Net Income', value: fmt(data.summary.netIncome), emphasize: true },
    { label: 'Net Margin', value: fmtPct(data.summary.netMarginPercent) },
  ]);

  if (theme.copy.footerText) {
    doc.moveDown(0.3);
    Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
  }
}
