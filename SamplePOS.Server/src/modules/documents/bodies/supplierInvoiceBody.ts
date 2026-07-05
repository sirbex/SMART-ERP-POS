/**
 * Supplier invoice (AP bill) PDF body — SSOT via documentRenderer.
 */
import type { LayoutContext } from '../baseDocumentLayout.js';
import { Layout } from '../baseDocumentLayout.js';
import { Money } from '../../../utils/money.js';
import { amountToWords } from '../../../utils/amountToWords.js';

export interface SupplierInvoiceBodyData {
  invoice: {
    invoiceNumber: string;
    supplierInvoiceNumber: string | null;
    invoiceDate: string | null;
    dueDate: string | null;
    status: string;
    subtotal: number;
    taxAmount: number;
    totalAmount: number;
    amountPaid: number;
    outstandingBalance: number;
    notes: string | null;
  };
  supplier: {
    name: string;
    contactName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  lineItems: Array<{
    lineNumber: number;
    productName: string;
    quantity: number;
    unitOfMeasure: string | null;
    unitCost: number;
    lineTotal: number;
  }>;
  allocations: Array<{
    paymentNumber: string;
    allocationDate: string | null;
    paymentMethod: string;
    amountAllocated: number;
  }>;
}

export function renderSupplierInvoiceBody(ctx: LayoutContext, data: SupplierInvoiceBodyData): void {
  const { theme, doc, contentLeft, contentWidth } = ctx;
  const fmt = (n: number) => Money.formatCurrency(n);
  const fmtDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { timeZone: 'Africa/Kampala' }) : '—';

  const colW = (contentWidth - theme.spacing.lg) / 2;
  const startY = doc.y;

  const supplierLines = [
    data.supplier.name,
    data.supplier.contactName ? `Contact: ${data.supplier.contactName}` : null,
    data.supplier.email,
    data.supplier.phone,
    data.supplier.address,
  ].filter((l): l is string => Boolean(l));

  const metaPairs: Array<[string, string]> = [
    ['Status', data.invoice.status],
    ...(data.invoice.supplierInvoiceNumber
      ? [['Supplier Ref', data.invoice.supplierInvoiceNumber] as [string, string]]
      : []),
    ['Invoice Date', fmtDate(data.invoice.invoiceDate)],
    ['Due Date', fmtDate(data.invoice.dueDate)],
    ['Total', fmt(data.invoice.totalAmount)],
    ['Paid', fmt(data.invoice.amountPaid)],
    ['Balance', fmt(data.invoice.outstandingBalance)],
  ];

  const panelHeight = Math.max(20 + supplierLines.length * 13 + 8, 20 + metaPairs.length * 16 + 8);

  doc
    .roundedRect(contentLeft, startY, colW, panelHeight, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  doc
    .fillColor(theme.colors.primary)
    .font(theme.fonts.familyBold)
    .fontSize(theme.fonts.size.sm)
    .text('SUPPLIER', contentLeft + 8, startY + 8, { width: colW - 16 });
  doc.fillColor(theme.colors.text).font(theme.fonts.family).fontSize(theme.fonts.size.base);
  let sy = startY + 24;
  supplierLines.forEach((l) => {
    doc.text(l, contentLeft + 8, sy, { width: colW - 16, ellipsis: true });
    sy += 13;
  });

  const rightX = contentLeft + colW + theme.spacing.lg;
  doc
    .roundedRect(rightX, startY, colW, panelHeight, 4)
    .fillAndStroke(theme.colors.bgSubtle, theme.colors.border);
  let my = startY + 8;
  metaPairs.forEach(([label, value]) => {
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

  doc.y = startY + panelHeight + theme.spacing.lg;
  doc.x = contentLeft;

  Layout.sectionTitle(ctx, 'Line Items');
  Layout.table(
    ctx,
    data.lineItems,
    [
      { header: '#', key: 'lineNumber' as const, width: 0.06, align: 'left' as const },
      { header: 'Product/Service', key: 'productName' as const, width: 0.34 },
      {
        header: 'Qty',
        key: 'quantity' as const,
        width: 0.12,
        align: 'right' as const,
        format: (v, row) => {
          const r = row as SupplierInvoiceBodyData['lineItems'][number];
          return r.unitOfMeasure ? `${v} ${r.unitOfMeasure}` : String(v);
        },
      },
      {
        header: 'Unit Cost',
        key: 'unitCost' as const,
        width: 0.18,
        align: 'right' as const,
        format: (v) => fmt(v as number),
      },
      {
        header: 'Total',
        key: 'lineTotal' as const,
        width: 0.2,
        align: 'right' as const,
        format: (v) => fmt(v as number),
      },
    ],
  );

  const totalRows: Array<{ label: string; value: string; emphasize?: boolean }> = [
    { label: 'Subtotal', value: fmt(data.invoice.subtotal) },
  ];
  if (data.invoice.taxAmount > 0) {
    totalRows.push({ label: 'Tax', value: fmt(data.invoice.taxAmount) });
  }
  totalRows.push(
    { label: 'Total', value: fmt(data.invoice.totalAmount), emphasize: true },
    { label: 'Amount Paid', value: fmt(data.invoice.amountPaid) },
    {
      label: 'Balance Due',
      value: fmt(data.invoice.outstandingBalance),
      emphasize: data.invoice.outstandingBalance > 0,
    },
  );
  Layout.totalsBlock(ctx, totalRows);

  Layout.sectionTitle(ctx, 'Amount in Words');
  Layout.text(ctx, amountToWords(data.invoice.totalAmount));

  if (data.allocations.length > 0) {
    Layout.sectionTitle(ctx, 'Payment History');
    Layout.table(
      ctx,
      data.allocations,
      [
        { header: 'Payment #', key: 'paymentNumber' as const, width: 0.3 },
        {
          header: 'Date',
          key: 'allocationDate' as const,
          width: 0.2,
          format: (v) => fmtDate(v as string | null),
        },
        { header: 'Method', key: 'paymentMethod' as const, width: 0.2 },
        {
          header: 'Amount',
          key: 'amountAllocated' as const,
          width: 0.3,
          align: 'right' as const,
          format: (v) => fmt(v as number),
        },
      ],
    );
  }

  if (data.invoice.notes) {
    Layout.sectionTitle(ctx, 'Notes');
    Layout.text(ctx, data.invoice.notes);
  }
}
