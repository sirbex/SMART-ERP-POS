/**
 * DeliveryNoteBody — customer delivery note (SAP-style DN).
 *
 * Honors `theme.flags.showPricesOnDeliveryNote` — when false, the unit-price
 * and line-total columns are hidden (warehouse-only copy).
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface DeliveryNoteBodyData {
  dn: {
    deliveryNoteNumber: string;
    status: string;
    deliveryDate: string | null;
    quotationNumber: string | null;
    invoiceNumber: string | null;
    customerName: string | null;
    deliveryAddress: string | null;
    driverName: string | null;
    vehicleNumber: string | null;
    warehouseNotes: string | null;
    totalAmount: number;
  };
  lines: Array<{
    productName: string | null;
    description: string | null;
    quantityDelivered: number;
    uomName: string | null;
    unitPrice: number;
    lineTotal: number;
  }>;
}

export function renderDeliveryNoteBody(ctx: LayoutContext, data: DeliveryNoteBodyData): void {
  const { theme, doc, contentWidth, contentLeft } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';
  const showPrices = theme.flags.showPricesOnDeliveryNote;

  // ── Customer + meta panels ──
  const colW = (contentWidth - theme.spacing.lg) / 2;
  const startY = doc.y;

  doc
    .roundedRect(contentLeft, startY, colW, 80, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  doc
    .fillColor(theme.colors.primary)
    .font(theme.fonts.familyBold)
    .fontSize(theme.fonts.size.sm)
    .text('DELIVER TO', contentLeft + 8, startY + 8, { width: colW - 16 });
  const billLines = [data.dn.customerName, data.dn.deliveryAddress].filter(
    (l): l is string => Boolean(l),
  );
  doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
  let by = startY + 24;
  billLines.slice(0, 4).forEach(l => {
    doc.text(l, contentLeft + 8, by, { width: colW - 16, ellipsis: true });
    by += 13;
  });

  const rightX = contentLeft + colW + theme.spacing.lg;
  doc
    .roundedRect(rightX, startY, colW, 80, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  const meta: Array<[string, string]> = [
    ['Delivery Date', fmtDate(data.dn.deliveryDate)],
    ['Status', data.dn.status],
    ['Quote', data.dn.quotationNumber ?? '—'],
    ['Invoice', data.dn.invoiceNumber ?? '—'],
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

  if (data.dn.driverName || data.dn.vehicleNumber) {
    Layout.kvGrid(ctx, [
      { label: 'Driver', value: data.dn.driverName ?? '—' },
      { label: 'Vehicle', value: data.dn.vehicleNumber ?? '—' },
    ]);
  }

  // ── Items ──
  Layout.sectionTitle(ctx, 'Delivered Items');
  const baseColumns = [
    { header: 'Product', key: 'productName' as const, width: showPrices ? 0.5 : 0.7, format: (_v: unknown, row: unknown) => {
      const r = row as DeliveryNoteBodyData['lines'][number];
      return r.productName || r.description || '—';
    } },
    { header: 'Qty Delivered', key: 'quantityDelivered' as const, width: showPrices ? 0.18 : 0.3, align: 'right' as const, format: (_v: unknown, row: unknown) => {
      const r = row as DeliveryNoteBodyData['lines'][number];
      return `${r.quantityDelivered}${r.uomName ? ' ' + r.uomName : ''}`;
    } },
  ];
  const priceColumns = showPrices
    ? [
        { header: 'Unit Price', key: 'unitPrice' as const, width: 0.14, align: 'right' as const, format: (v: unknown) => fmt(v as number) },
        { header: 'Total', key: 'lineTotal' as const, width: 0.18, align: 'right' as const, format: (v: unknown) => fmt(v as number) },
      ]
    : [];
  Layout.table(ctx, data.lines, [...baseColumns, ...priceColumns]);

  if (showPrices) {
    Layout.totalsBlock(ctx, [
      { label: 'Total', value: fmt(data.dn.totalAmount), emphasize: true },
    ]);
  }

  if (data.dn.warehouseNotes) {
    Layout.sectionTitle(ctx, 'Notes');
    Layout.text(ctx, data.dn.warehouseNotes);
    doc.moveDown(0.3);
  }

  // ── Signature blocks ──
  doc.moveDown(1);
  const sigY = doc.y;
  const sigW = (contentWidth - theme.spacing.lg) / 2;
  doc
    .strokeColor(theme.colors.border)
    .lineWidth(0.5)
    .moveTo(contentLeft, sigY + 30)
    .lineTo(contentLeft + sigW, sigY + 30)
    .stroke()
    .moveTo(contentLeft + sigW + theme.spacing.lg, sigY + 30)
    .lineTo(contentLeft + contentWidth, sigY + 30)
    .stroke();
  doc
    .fillColor(theme.colors.muted)
    .font(theme.fonts.family)
    .fontSize(theme.fonts.size.xs)
    .text('Delivered By (Sign & Date)', contentLeft, sigY + 35, { width: sigW })
    .text('Received By (Sign & Date)', contentLeft + sigW + theme.spacing.lg, sigY + 35, { width: sigW });
}
