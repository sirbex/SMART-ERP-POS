/**
 * CashFlowBody — period cash movement summary across cash/bank accounts.
 * Currently a summary-only view (beginning balance, period debits/credits, ending).
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface CashFlowBodyData {
  periodStart: string;
  periodEnd: string;
  beginningBalance: number;
  periodDebits: number;
  periodCredits: number;
  netMovement: number;
  endingBalance: number;
}

export function renderCashFlowBody(ctx: LayoutContext, data: CashFlowBodyData): void {
  const { theme, doc, contentWidth } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' });

  Layout.kvGrid(ctx, [
    { label: 'Period Start', value: fmtDate(data.periodStart) },
    { label: 'Period End', value: fmtDate(data.periodEnd) },
  ]);
  doc.moveDown(0.5);

  Layout.sectionTitle(ctx, 'Cash Position');
  Layout.kvGrid(ctx, [
    { label: 'Beginning Balance', value: fmt(data.beginningBalance) },
    { label: 'Period Cash Inflows (Debits)', value: fmt(data.periodDebits) },
    { label: 'Period Cash Outflows (Credits)', value: fmt(data.periodCredits) },
    { label: 'Net Movement', value: fmt(data.netMovement) },
  ]);
  doc.moveDown(0.5);

  Layout.totalsBlock(ctx, [
    { label: 'Beginning Balance', value: fmt(data.beginningBalance) },
    { label: 'Net Movement', value: fmt(data.netMovement) },
    { label: 'Ending Balance', value: fmt(data.endingBalance), emphasize: true },
  ]);

  if (theme.copy.footerText) {
    doc.moveDown(0.3);
    Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
  }
}
