/**
 * GoodsReceiptBody — supplier delivery / GRN document.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface GoodsReceiptBodyData {
  gr: {
    grNumber: string;
    status: string;
    receivedDate: string | null;
    poNumber: string | null;
    supplierName: string | null;
    receivedByName: string | null;
    supplierDeliveryNote: string | null;
  };
  items: Array<{
    productName: string;
    orderedQuantity: number;
    receivedQuantity: number;
    uomName: string | null;
    unitCost: number;
    batchNumber: string | null;
    expiryDate: string | null;
    isBonus: boolean;
  }>;
}

export function renderGoodsReceiptBody(ctx: LayoutContext, data: GoodsReceiptBodyData): void {
  const { theme, doc, contentWidth } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

  Layout.kvGrid(ctx, [
    { label: 'GRN Number', value: data.gr.grNumber },
    { label: 'PO Number', value: data.gr.poNumber ?? '—' },
    { label: 'Received Date', value: fmtDate(data.gr.receivedDate) },
    { label: 'Status', value: data.gr.status },
    { label: 'Supplier', value: data.gr.supplierName ?? '—' },
    { label: 'Received By', value: data.gr.receivedByName ?? '—' },
    { label: 'Supplier Delivery Note', value: data.gr.supplierDeliveryNote ?? '—' },
  ]);

  Layout.sectionTitle(ctx, 'Received Items');
  Layout.table(
    ctx,
    data.items,
    [
      { header: 'Product', key: 'productName' as const, width: 0.32, format: (v, row) => {
        const r = row as GoodsReceiptBodyData['items'][number];
        return r.isBonus ? `${v as string}  (BONUS)` : (v as string);
      } },
      { header: 'Ordered', key: 'orderedQuantity' as const, width: 0.1, align: 'right' as const, format: v => String(v) },
      { header: 'Received', key: 'receivedQuantity' as const, width: 0.1, align: 'right' as const, format: (v, row) => {
        const r = row as GoodsReceiptBodyData['items'][number];
        return `${r.receivedQuantity}${r.uomName ? ' ' + r.uomName : ''}`;
      } },
      { header: 'Unit Cost', key: 'unitCost' as const, width: 0.13, align: 'right' as const, format: v => fmt(v as number) },
      { header: 'Batch', key: 'batchNumber' as const, width: 0.18, format: v => (v as string) || '—' },
      { header: 'Expiry', key: 'expiryDate' as const, width: 0.17, format: v => fmtDate(v as string | null) },
    ],
  );

  if (theme.copy.footerText) {
    doc.moveDown(0.5);
    Layout.text(ctx, theme.copy.footerText, { width: contentWidth });
  }
}
