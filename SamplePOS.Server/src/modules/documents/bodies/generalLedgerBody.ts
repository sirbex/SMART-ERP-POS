/**
 * GeneralLedgerBody — detailed journal-line listing.
 * Optionally filtered by account; otherwise full GL detail.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface GeneralLedgerEntryRow {
  entryDate: string;
  accountCode: string;
  accountName: string;
  reference: string;
  description: string;
  debitAmount: number;
  creditAmount: number;
}

export interface GeneralLedgerBodyData {
  periodStart: string | null;
  periodEnd: string | null;
  accountCode: string | null;
  accountName: string | null;
  entries: GeneralLedgerEntryRow[];
  totalCount: number;
}

export function renderGeneralLedgerBody(
  ctx: LayoutContext,
  data: GeneralLedgerBodyData,
): void {
  const { theme, doc, contentWidth } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

  const meta: Array<{ label: string; value: string }> = [
    { label: 'Period Start', value: fmtDate(data.periodStart) },
    { label: 'Period End', value: fmtDate(data.periodEnd) },
  ];
  if (data.accountCode) {
    meta.push({
      label: 'Account',
      value: `${data.accountCode}${data.accountName ? ' — ' + data.accountName : ''}`,
    });
  } else {
    meta.push({ label: 'Account', value: 'All Accounts' });
  }
  Layout.kvGrid(ctx, meta);
  doc.moveDown(0.5);

  Layout.sectionTitle(ctx, 'Ledger Entries');

  if (data.entries.length === 0) {
    Layout.text(ctx, 'No ledger entries for the selected period.');
  } else {
    Layout.table(ctx, data.entries as unknown as Record<string, unknown>[], [
      {
        header: 'Date',
        key: 'entryDate' as const,
        width: 0.11,
        format: v => fmtDate(v as string | null),
      },
      { header: 'Code', key: 'accountCode' as const, width: 0.09 },
      { header: 'Account', key: 'accountName' as const, width: 0.2 },
      { header: 'Reference', key: 'reference' as const, width: 0.15 },
      { header: 'Description', key: 'description' as const, width: 0.21 },
      {
        header: 'Debit',
        key: 'debitAmount' as const,
        width: 0.12,
        align: 'right' as const,
        format: v => ((v as number) ? fmt(v as number) : '—'),
      },
      {
        header: 'Credit',
        key: 'creditAmount' as const,
        width: 0.12,
        align: 'right' as const,
        format: v => ((v as number) ? fmt(v as number) : '—'),
      },
    ]);
  }

  const totalDebits = data.entries.reduce((s, e) => s + e.debitAmount, 0);
  const totalCredits = data.entries.reduce((s, e) => s + e.creditAmount, 0);

  Layout.totalsBlock(ctx, [
    { label: 'Entries Shown', value: String(data.entries.length) },
    { label: 'Total Records', value: String(data.totalCount) },
    { label: 'Total Debits', value: fmt(totalDebits) },
    { label: 'Total Credits', value: fmt(totalCredits), emphasize: true },
  ]);

  if (data.entries.length < data.totalCount) {
    doc.moveDown(0.3);
    Layout.text(
      ctx,
      `Showing first ${data.entries.length} of ${data.totalCount} entries. Refine filters to see more detail.`,
    );
  }

  if (theme.copy.footerText) {
    doc.moveDown(0.3);
    Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
  }
}
