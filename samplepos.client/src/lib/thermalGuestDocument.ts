/**
 * Thermal guest document SSOT — RECEIPT and GUEST BILL share one HTML layout.
 * Money uses formatCurrency. Lines use consolidatePricedLines.
 * Kitchen KOT stays separate (no prices).
 */

import { consolidatePricedLines } from '@shared/utils/consolidatePricedLines';
import type { ThermalTicket } from '@shared/printing/thermalTicket';
import { formatCurrency } from '../utils/currency';
import {
  documentCompanyHeaderHtml,
  type DocumentCompanyBranding,
} from './documentCompanyBranding';
import { buildThermalPrintCss } from './thermalPrintCss';

export type ThermalGuestMetaRow = { label: string; value: string };

export type ThermalGuestLine = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  note?: string | null;
};

export type ThermalGuestDocument = DocumentCompanyBranding & {
  kind: 'RECEIPT' | 'BILL';
  /** Center title: RECEIPT | GUEST BILL */
  title: string;
  documentNumber: string;
  printedAt: string;
  channelLabel?: string | null;
  meta: ThermalGuestMetaRow[];
  items: ThermalGuestLine[];
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  taxName?: string;
  totalAmount: number;
  /** Extra settlement rows (payment method, change, etc.) */
  paymentRows?: ThermalGuestMetaRow[];
  paymentAccounts?: Array<{
    provider: string;
    accountName: string;
    accountNumber: string;
    branchOrCode?: string;
  }>;
  customNote?: string | null;
  footerLines: string[];
  isReprint?: boolean;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Shared money formatter for guest docs (receipt + bill). */
export function formatGuestDocMoney(amount: number): string {
  return formatCurrency(amount);
}

/**
 * Single HTML template for guest-facing thermal docs (receipt + bill).
 */
export function buildThermalGuestDocumentHtml(doc: ThermalGuestDocument): string {
  const fmt = formatGuestDocMoney;
  const companyBlock = documentCompanyHeaderHtml(
    {
      companyName: doc.companyName,
      companyAddress: doc.companyAddress,
      companyPhone: doc.companyPhone,
    },
    { mode: 'guest', escapeHtml },
  );

  const metaRows = doc.meta
    .filter((r) => r.value != null && String(r.value).trim() !== '')
    .map(
      (r) =>
        `<div class="meta-row"><span>${escapeHtml(r.label)}</span><span>${escapeHtml(String(r.value))}</span></div>`,
    )
    .join('');

  const lines = doc.items
    .map((it) => {
      const note = it.note
        ? `<div class="note">* ${escapeHtml(it.note)}</div>`
        : '';
      return `<div class="line">
        <div class="name">${escapeHtml(it.name)}</div>
        ${note}
        <div class="row">
          <span>${escapeHtml(String(it.quantity))} × ${fmt(it.unitPrice)}</span>
          <span class="amt">${fmt(it.lineTotal)}</span>
        </div>
      </div>`;
    })
    .join('');

  const paymentBlock =
    doc.paymentRows && doc.paymentRows.length > 0
      ? `<hr/>${doc.paymentRows
          .map(
            (r) =>
              `<div class="tot-row"><span>${escapeHtml(r.label)}</span><span>${escapeHtml(r.value)}</span></div>`,
          )
          .join('')}`
      : '';

  const accountsBlock =
    doc.paymentAccounts && doc.paymentAccounts.length > 0
      ? `<div class="accounts">
          <div class="accounts-title">Payment Details</div>
          ${doc.paymentAccounts
            .map(
              (acc) => `<div class="account">
                <div class="name">${escapeHtml(acc.provider)}</div>
                <div>${escapeHtml(acc.accountName)} — ${escapeHtml(acc.accountNumber)}</div>
                ${acc.branchOrCode ? `<div>${escapeHtml(acc.branchOrCode)}</div>` : ''}
              </div>`,
            )
            .join('')}
        </div>`
      : '';

  const customNote = doc.customNote
    ? `<div class="custom-note">${escapeHtml(doc.customNote)}</div>`
    : '';

  const footer = doc.footerLines
    .map((l) => `<div class="footer">${escapeHtml(l)}</div>`)
    .join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>${escapeHtml(doc.title)} ${escapeHtml(doc.documentNumber)}</title>
<style>
  ${buildThermalPrintCss(80)}
  /* Larger + bold black — thermal drivers wash out thin/light type */
  body {
    font-size: 15px;
    font-weight: 700;
    color: #000;
    padding: 10px 8px;
  }
  h1 { font-size: 20px; font-weight: 900; margin: 6px 0 8px; text-align: center; letter-spacing: 1px; color: #000; }
  .reprint { text-align: center; border: 2px solid #000; padding: 4px 0; margin-bottom: 8px; font-weight: 900; letter-spacing: 1px; }
  .channel { text-align: center; font-size: 14px; font-weight: 900; margin-bottom: 6px; }
  .meta { font-size: 13px; margin-bottom: 6px; font-weight: 700; }
  .meta-row { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
  .meta-row span:last-child { text-align: right; font-weight: 900; }
  hr { border: none; border-top: 2px dashed #000; margin: 8px 0; }
  .line { margin: 8px 0; }
  .name { font-weight: 900; font-size: 15px; word-break: break-word; color: #000; }
  .note { font-size: 13px; font-weight: 700; padding-left: 6px; margin-top: 2px; }
  .row { display: flex; justify-content: space-between; gap: 10px; margin-top: 3px; font-size: 14px; font-weight: 700; }
  .amt { white-space: nowrap; font-weight: 900; }
  .tot-row { display: flex; justify-content: space-between; gap: 10px; margin: 3px 0; font-size: 15px; font-weight: 700; }
  .tot-row.grand { font-weight: 900; font-size: 18px; margin-top: 6px; }
  .footer { text-align: center; font-size: 13px; font-weight: 700; margin-top: 4px; }
  .accounts { text-align: left; font-size: 13px; font-weight: 700; margin-top: 8px; border-top: 2px dashed #000; padding-top: 8px; }
  .accounts-title { font-weight: 900; margin-bottom: 4px; }
  .account { margin-bottom: 4px; }
  .custom-note { text-align: left; font-size: 13px; font-weight: 700; white-space: pre-line; margin-top: 8px; border-top: 2px dashed #000; padding-top: 8px; }
</style></head><body>
  ${doc.isReprint ? `<div class="reprint">*** REPRINTED COPY ***</div>` : ''}
  ${companyBlock}
  <h1>${escapeHtml(doc.title)}</h1>
  ${doc.channelLabel ? `<div class="channel">${escapeHtml(doc.channelLabel)}</div>` : ''}
  <div class="meta">${metaRows}</div>
  <hr/>
  ${lines || '<div class="footer">No items</div>'}
  <hr/>
  ${doc.subtotal !== undefined ? `<div class="tot-row"><span>Subtotal</span><span>${fmt(doc.subtotal)}</span></div>` : ''}
  ${doc.discountAmount && doc.discountAmount > 0 ? `<div class="tot-row"><span>Discount</span><span>-${fmt(doc.discountAmount)}</span></div>` : ''}
  ${doc.taxAmount && doc.taxAmount > 0 ? `<div class="tot-row"><span>${escapeHtml(doc.taxName || 'Tax')}</span><span>${fmt(doc.taxAmount)}</span></div>` : ''}
  <div class="tot-row grand"><span>TOTAL</span><span>${fmt(doc.totalAmount)}</span></div>
  ${paymentBlock}
  ${accountsBlock}
  ${customNote}
  <hr/>
  ${footer}
</body></html>`;
}

/** Map restaurant bill → thermal guest SSOT (consolidates priced lines). */
export function billToThermalGuestDocument(data: {
  orderNumber: string;
  tableLabel: string;
  waiterName?: string | null;
  printedAt?: string | null;
  orderChannel?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  deliveryAddress?: string | null;
  pickupLabel?: string | null;
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  items: Array<{
    productId?: string | null;
    productName: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    lineNotes?: string | null;
  }>;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  taxName?: string;
  totalAmount: number;
}): ThermalGuestDocument {
  const printedAt =
    String(data.printedAt || '').trim() ||
    new Date().toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

  const consolidated = consolidatePricedLines(
    data.items.map((it) => ({
      productId: it.productId ?? null,
      productName: it.productName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      lineNotes: it.lineNotes ?? null,
    })),
  );

  const channelLabel =
    data.orderChannel === 'TAKEAWAY'
      ? 'TAKE AWAY'
      : data.orderChannel === 'DELIVERY'
        ? 'DELIVERY'
        : null;

  const meta: ThermalGuestMetaRow[] = [
    { label: 'Table', value: data.tableLabel },
    { label: 'Order', value: data.orderNumber },
    { label: 'Date', value: printedAt },
  ];
  if (data.waiterName) meta.push({ label: 'Waiter', value: data.waiterName });
  if (data.guestName) meta.push({ label: 'Guest', value: data.guestName });
  if (data.guestPhone) meta.push({ label: 'Phone', value: data.guestPhone });
  if (data.pickupLabel) meta.push({ label: 'Pickup', value: data.pickupLabel });
  if (data.deliveryAddress) meta.push({ label: 'Address', value: data.deliveryAddress });

  return {
    kind: 'BILL',
    title: 'GUEST BILL',
    documentNumber: data.orderNumber,
    printedAt,
    companyName: data.companyName,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    channelLabel,
    meta,
    items: consolidated.map((c) => ({
      name: c.productName,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      lineTotal: c.lineTotal,
      note: c.lineNotes,
    })),
    subtotal: data.subtotal,
    discountAmount: data.discountAmount,
    taxAmount: data.taxAmount,
    taxName: data.taxName,
    totalAmount: data.totalAmount,
    footerLines: ['Pay at cashier', 'Thank you'],
  };
}

/** Map POS receipt → thermal guest SSOT (same HTML as bill). */
export function receiptToThermalGuestDocument(data: {
  saleNumber: string;
  saleDate: string;
  totalAmount: number;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  cashierName?: string;
  items?: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    uom?: string;
    discountAmount?: number;
  }>;
  paymentMethod?: string;
  amountPaid?: number;
  changeAmount?: number;
  payments?: Array<{ method: string; amount: number; reference?: string }>;
  changeGiven?: number;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  paymentAccounts?: ThermalGuestDocument['paymentAccounts'];
  customReceiptNote?: string;
  isReprint?: boolean;
}): ThermalGuestDocument {
  const plain = (data.items || []).filter((i) => !i.discountAmount);
  const discounted = (data.items || []).filter((i) => !!i.discountAmount);
  const consolidated = consolidatePricedLines(
    plain.map((item) => ({
      productName: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.subtotal,
      mergeKeyExtra: item.uom || null,
    })),
  );

  const items: ThermalGuestLine[] = [
    ...consolidated.map((c) => ({
      name: c.mergeKeyExtra ? `${c.productName} (${c.mergeKeyExtra})` : c.productName,
      quantity: c.quantity,
      unitPrice: c.unitPrice,
      lineTotal: c.lineTotal,
      note: null,
    })),
    ...discounted.map((item) => ({
      name: item.uom ? `${item.name} (${item.uom})` : item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.subtotal,
      note: item.discountAmount ? `Disc: -${formatGuestDocMoney(item.discountAmount)}` : null,
    })),
  ];

  const meta: ThermalGuestMetaRow[] = [
    { label: 'Sale #', value: data.saleNumber },
    { label: 'Date', value: data.saleDate },
  ];
  if (data.customerName) meta.push({ label: 'Customer', value: data.customerName });
  if (data.customerPhone) meta.push({ label: 'Tel', value: data.customerPhone });
  if (data.customerEmail) meta.push({ label: 'Email', value: data.customerEmail });
  if (data.cashierName) meta.push({ label: 'Served by', value: data.cashierName });

  const paymentRows: ThermalGuestMetaRow[] = [];
  if (data.payments && data.payments.length > 0) {
    for (const payment of data.payments) {
      const label =
        payment.method === 'CREDIT'
          ? 'Balance'
          : payment.method === 'CASH'
            ? 'Cash Given'
            : payment.method;
      paymentRows.push({
        label: payment.reference ? `${label} (${payment.reference})` : label,
        value: formatGuestDocMoney(payment.amount),
      });
    }
    if (data.changeGiven != null && data.changeGiven > 0) {
      paymentRows.push({ label: 'Change', value: formatGuestDocMoney(data.changeGiven) });
    }
  } else if (data.paymentMethod) {
    paymentRows.push({ label: 'Payment', value: data.paymentMethod });
    if (data.amountPaid != null) {
      paymentRows.push({ label: 'Amount Paid', value: formatGuestDocMoney(data.amountPaid) });
    }
    if (data.changeAmount != null && data.changeAmount > 0) {
      paymentRows.push({ label: 'Change', value: formatGuestDocMoney(data.changeAmount) });
    }
  }

  return {
    kind: 'RECEIPT',
    title: 'RECEIPT',
    documentNumber: data.saleNumber,
    printedAt: data.saleDate,
    companyName: data.companyName,
    companyAddress: data.companyAddress,
    companyPhone: data.companyPhone,
    meta,
    items,
    subtotal: data.subtotal,
    discountAmount: data.discountAmount,
    taxAmount: data.taxAmount,
    taxName: 'Tax',
    totalAmount: data.totalAmount,
    paymentRows,
    paymentAccounts: data.paymentAccounts,
    customNote: data.customReceiptNote,
    footerLines: ['Thank you for your business!'],
    isReprint: data.isReprint,
  };
}

/** Map guest HTML SSOT → canonical ThermalTicket for EscPosRenderer. */
export function guestDocumentToThermalTicket(doc: ThermalGuestDocument): ThermalTicket {
  const table =
    doc.meta.find((m) => /^table$/i.test(m.label))?.value ||
    doc.meta.find((m) => /table/i.test(m.label))?.value ||
    '';
  return {
    kind: doc.kind === 'RECEIPT' ? 'RECEIPT' : 'GUEST_BILL',
    title: doc.title,
    documentNumber: doc.documentNumber,
    tableLabel: table,
    firedAt: doc.printedAt,
    channelLabel: doc.channelLabel || null,
    companyName: doc.companyName || null,
    companyAddress: doc.companyAddress || null,
    companyPhone: doc.companyPhone || null,
    metaRows: doc.meta.map((m) => ({ label: m.label, value: String(m.value) })),
    items: doc.items.map((it) => ({
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      lineTotal: it.lineTotal,
      note: it.note,
    })),
    subtotal: doc.subtotal ?? null,
    discountAmount: doc.discountAmount ?? null,
    taxAmount: doc.taxAmount ?? null,
    taxName: doc.taxName || null,
    totalAmount: doc.totalAmount,
    paymentRows: doc.paymentRows?.map((r) => ({ label: r.label, value: r.value })) || null,
    customNote: doc.customNote || null,
    footerLines: doc.footerLines,
  };
}
