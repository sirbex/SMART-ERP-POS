/**
 * PurchaseOrderBody — supplier-bound purchase order document.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface PurchaseOrderBodyData {
  po: {
    poNumber: string;
    status: string;
    orderDate: string | null;
    expectedDate: string | null;
    totalAmount: number;
    notes: string | null;
  };
  supplier: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    tin: string | null;
  };
  items: Array<{
    productName: string;
    quantity: number;
    uomName: string | null;
    unitCost: number;
    lineTotal: number;
    receivedQuantity: number;
  }>;
}

export function renderPurchaseOrderBody(ctx: LayoutContext, data: PurchaseOrderBodyData): void {
  const { theme, doc, contentWidth, contentLeft } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

  // ── Supplier + meta panels ──
  const colW = (contentWidth - theme.spacing.lg) / 2;
  const startY = doc.y;

  doc
    .roundedRect(contentLeft, startY, colW, 90, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  doc
    .fillColor(theme.colors.primary)
    .font(theme.fonts.familyBold)
    .fontSize(theme.fonts.size.sm)
    .text('SUPPLIER', contentLeft + 8, startY + 8, { width: colW - 16 });
  const supplierLines = [
    data.supplier.name,
    data.supplier.address,
    data.supplier.phone,
    data.supplier.email,
    data.supplier.tin,
  ].filter((l): l is string => Boolean(l));
  doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
  let by = startY + 24;
  supplierLines.slice(0, 5).forEach(l => {
    doc.text(l, contentLeft + 8, by, { width: colW - 16, ellipsis: true });
    by += 12;
  });

  const rightX = contentLeft + colW + theme.spacing.lg;
  doc
    .roundedRect(rightX, startY, colW, 90, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  const meta: Array<[string, string]> = [
    ['Order Date', fmtDate(data.po.orderDate)],
    ['Expected', fmtDate(data.po.expectedDate)],
    ['Status', data.po.status],
    ['Total', fmt(data.po.totalAmount)],
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
  doc.y = startY + 90 + theme.spacing.lg;

  // ── Items ──
  Layout.sectionTitle(ctx, 'Order Items');
  Layout.table(
    ctx,
    data.items,
    [
      { header: 'Product', key: 'productName' as const, width: 0.45 },
      { header: 'Qty', key: 'quantity' as const, width: 0.12, align: 'right' as const, format: (v, row) => {
        const r = row as PurchaseOrderBodyData['items'][number];
        return `${r.quantity}${r.uomName ? ' ' + r.uomName : ''}`;
      } },
      { header: 'Received', key: 'receivedQuantity' as const, width: 0.12, align: 'right' as const, format: v => String(v ?? 0) },
      { header: 'Unit Cost', key: 'unitCost' as const, width: 0.13, align: 'right' as const, format: v => fmt(v as number) },
      { header: 'Total', key: 'lineTotal' as const, width: 0.18, align: 'right' as const, format: v => fmt(v as number) },
    ],
  );

  // ── Totals ──
  Layout.totalsBlock(ctx, [
    { label: 'Total', value: fmt(data.po.totalAmount), emphasize: true },
  ]);

  if (data.po.notes) {
    Layout.sectionTitle(ctx, 'Notes');
    Layout.text(ctx, data.po.notes);
    doc.moveDown(0.3);
  }

  if (theme.copy.termsAndConditions) {
    Layout.sectionTitle(ctx, 'Terms & Conditions');
    Layout.text(ctx, theme.copy.termsAndConditions, { width: contentWidth });
  }
}
