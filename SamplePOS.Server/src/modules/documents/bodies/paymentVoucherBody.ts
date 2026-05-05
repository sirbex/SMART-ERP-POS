/**
 * PaymentVoucherBody — disbursement voucher for a supplier payment.
 *
 * Header lists the payment metadata (number, date, method, reference);
 * a table of invoice allocations (which bills this payment was applied to)
 * is followed by the totals block and signature lines.
 */

import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';

export interface PaymentVoucherBodyData {
  payment: {
    paymentNumber: string;
    paymentDate: string | null;
    paymentMethod: string;
    amount: number;
    allocatedAmount: number;
    unallocatedAmount: number;
    reference: string | null;
    notes: string | null;
  };
  supplier: {
    name: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    contactPerson: string | null;
  };
  allocations: Array<{
    invoiceNumber: string | null;
    allocatedAt: string | null;
    amount: number;
  }>;
}

export function renderPaymentVoucherBody(
  ctx: LayoutContext,
  data: PaymentVoucherBodyData,
): void {
  const { theme, doc, contentWidth, contentLeft } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

  // ── Two-panel header: PAY TO (supplier) + voucher meta ──
  const colW = (contentWidth - theme.spacing.lg) / 2;
  const startY = doc.y;

  doc
    .roundedRect(contentLeft, startY, colW, 90, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  doc
    .fillColor(theme.colors.primary)
    .font(theme.fonts.familyBold)
    .fontSize(theme.fonts.size.sm)
    .text('PAY TO', contentLeft + 8, startY + 8, { width: colW - 16 });
  const supplierLines = [
    data.supplier.name,
    data.supplier.contactPerson,
    data.supplier.address,
    data.supplier.phone,
    data.supplier.email,
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
    ['Payment Date', fmtDate(data.payment.paymentDate)],
    ['Method', data.payment.paymentMethod.replace(/_/g, ' ')],
    ['Reference', data.payment.reference || '—'],
    ['Amount', fmt(data.payment.amount)],
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

  // ── Allocations ──
  if (data.allocations.length > 0) {
    Layout.sectionTitle(ctx, 'Applied to Invoices');
    Layout.table(ctx, data.allocations, [
      {
        header: 'Invoice',
        key: 'invoiceNumber' as const,
        width: 0.4,
        format: v => (v as string) || '—',
      },
      {
        header: 'Allocated On',
        key: 'allocatedAt' as const,
        width: 0.3,
        format: v => fmtDate(v as string | null),
      },
      {
        header: 'Amount Applied',
        key: 'amount' as const,
        width: 0.3,
        align: 'right' as const,
        format: v => fmt(v as number),
      },
    ]);
  } else {
    Layout.sectionTitle(ctx, 'Applied to Invoices');
    Layout.text(ctx, 'No invoice allocations on record.');
    doc.moveDown(0.3);
  }

  // ── Totals ──
  Layout.totalsBlock(ctx, [
    { label: 'Payment Amount', value: fmt(data.payment.amount) },
    { label: 'Total Allocated', value: fmt(data.payment.allocatedAmount) },
    {
      label: 'Unallocated Balance',
      value: fmt(data.payment.unallocatedAmount),
      emphasize: true,
    },
  ]);

  if (data.payment.notes) {
    Layout.sectionTitle(ctx, 'Notes');
    Layout.text(ctx, data.payment.notes);
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
    .text('Prepared By', contentLeft, sigY + 35, { width: sigW })
    .text('Authorised By', contentLeft + sigW + theme.spacing.lg, sigY + 35, { width: sigW });
}
